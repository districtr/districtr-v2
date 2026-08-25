"""Per-zone map notes ("district notes"), split out of the form-comment tables.

These are the notes a map author attaches to a district or community while
editing (synced wholesale on every PUT /api/assignments), not public form
submissions. They used to share comments.comment + comments.document_comment
with written testimony; that coupling is what made the comment tables hard to
replace. This table is theirs alone.

Moderation is automatic-only: a background task scores the text (OpenAI with
a profanity-list fallback, see app.comments.moderation.score_text) and sets
`nsfw`; the public read path shows a placeholder for nsfw notes while edit
access always sees the real text. There is no human review surface — the CMS
moderation UI never exposed district comments.
"""

import logging

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import (
    CheckConstraint,
    Column,
    Field,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Session,
    String,
    col,
    select,
)
from sqlalchemy import Boolean, delete, update

from app.constants import COMMENTS_SCHEMA
from app.core.db import engine
from app.core.models import SQLModel, TimeStampMixin
from app.models import DistrictrMap, Document, DocumentCommentCreate

logger = logging.getLogger(__name__)

DEFAULT_MAX_COMMENT_LENGTH = 240
DEFAULT_MAX_COMMENTS_PER_DISTRICT = 1


class DistrictNote(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __tablename__ = "district_notes"
    __table_args__ = (
        CheckConstraint("zone >= 0", name="zone_non_negative"),
        CheckConstraint("LENGTH(TRIM(note)) > 0", name="note_not_empty"),
        Index("idx_district_notes_document_zone", "document_id", "zone"),
    )

    id: int = Field(
        sa_column=Column(
            Integer,
            nullable=False,
            autoincrement=True,
            primary_key=True,
        )
    )
    document_id: str = Field(
        sa_column=Column(
            ForeignKey(Document.document_id, ondelete="CASCADE"),
            nullable=False,
        )
    )
    zone: int = Field(sa_column=Column(Integer, nullable=False))
    note: str = Field(sa_column=Column(String(5000), nullable=False))
    nsfw: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    moderation_score: float = Field(
        sa_column=Column(Float, nullable=True, default=None)
    )


def _get_note_limits_for_document(
    document_id: str, session: Session
) -> tuple[int, int]:
    """Per-map note length/count limits from the document's DistrictrMap."""
    row = session.exec(  # type: ignore[no-matching-overload]
        select(
            DistrictrMap.comment_length_limit,
            DistrictrMap.comment_count_limit,
        )
        .join(
            Document,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
        )
        .where(Document.document_id == document_id)
    ).first()
    if row is None:
        return (DEFAULT_MAX_COMMENT_LENGTH, DEFAULT_MAX_COMMENTS_PER_DISTRICT)
    max_length = row[0] if row[0] is not None else DEFAULT_MAX_COMMENT_LENGTH
    max_count = row[1] if row[1] is not None else DEFAULT_MAX_COMMENTS_PER_DISTRICT
    return (max_length, max_count)


def moderate_note_by_id(
    note_id: int, text: str, session: Session | None = None
) -> None:
    """Background task: score a note's text and persist score + nsfw.

    When ``session`` is None (the background-task case) a dedicated session is
    opened — the request-scoped session is closed by the time background tasks
    run (see app.comments.moderation._moderate).
    """
    from app.submissions.moderation import MODERATION_THRESHOLD, score_text

    score = score_text(text)

    def _write(sess: Session) -> None:
        sess.execute(
            update(DistrictNote)
            .where(col(DistrictNote.id) == note_id)
            .values(moderation_score=score, nsfw=score >= MODERATION_THRESHOLD)
        )
        try:
            sess.commit()
        except Exception:
            sess.rollback()
            logger.exception(f"Failed to save moderation score for note {note_id}")
            raise

    if session is not None:
        _write(session)
    else:
        with Session(engine) as owned_session:
            _write(owned_session)


def sync_district_notes(
    document_id: str,
    notes: list[DocumentCommentCreate],
    session: Session,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Full replace-by-diff sync of a document's zone notes.

    Each note is {comment_id?, zone, text}: a comment_id that exists for this
    document updates that row, anything else inserts, and existing rows not in
    the payload are deleted. Notes are truncated to the map's length limit and
    capped per zone. Document existence is enforced upstream (the assignments
    endpoint 404s first) and by the FK.
    """
    max_note_length, max_notes_per_zone = _get_note_limits_for_document(
        document_id, session
    )

    existing_ids = set(
        session.scalars(
            select(DistrictNote.id).where(col(DistrictNote.document_id) == document_id)
        )
    )

    # Normalize first: a note that is empty after truncation (blank input, or
    # a map with comment_length_limit=0 — the supported "descriptions
    # disabled" config) is treated as a deletion, NOT sent to the DB where
    # the note_not_empty CHECK would 500 the whole assignments save.
    normalized: list[tuple[DocumentCommentCreate, str]] = []
    for n in notes:
        if n.zone is None:
            continue
        text = (n.text or "")[:max_note_length]
        if not text.strip():
            continue
        normalized.append((n, text))

    zone_counts: dict[int, int] = {}
    for n, _ in normalized:
        zone_counts[n.zone] = zone_counts.get(n.zone, 0) + 1
    for zone_val, count in zone_counts.items():
        if count > max_notes_per_zone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {max_notes_per_zone} comments per zone (zone {zone_val})",
            )

    kept_ids: set[int] = set()
    for n, text in normalized:
        if n.comment_id is not None and n.comment_id in existing_ids:
            session.execute(
                update(DistrictNote)
                .where(col(DistrictNote.id) == n.comment_id)
                .values(note=text, zone=n.zone)
            )
            note_id = n.comment_id
        else:
            new_note = DistrictNote(document_id=document_id, zone=n.zone, note=text)
            session.add(new_note)
            session.flush()
            note_id = new_note.id
        kept_ids.add(note_id)
        if background_tasks:
            background_tasks.add_task(moderate_note_by_id, note_id, text)

    to_delete = existing_ids - kept_ids
    if to_delete:
        session.execute(delete(DistrictNote).where(col(DistrictNote.id).in_(to_delete)))


def duplicate_district_notes(
    *,
    from_document_id: str,
    to_document_id: str,
    session: Session,
) -> int:
    """Copy a document's zone notes to another document (map duplication).

    The moderation verdict is carried over: create_document only requires a
    session token, so resetting nsfw on copy would let anyone launder a
    moderated note into public view by copying the map and never saving
    (copies still re-moderate on their next save).
    """
    source = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == from_document_id)
    ).all()
    for note in source:
        session.add(
            DistrictNote(
                document_id=to_document_id,
                zone=note.zone,
                note=note.note,
                nsfw=note.nsfw,
                moderation_score=note.moderation_score,
            )
        )
    return len(source)
