"""Sync and copy of district notes (see models.py for what they are)."""

from fastapi import BackgroundTasks, HTTPException, status
from sqlmodel import Session, col, select
from sqlalchemy import delete, update

from app.district_notes.models import (
    DEFAULT_MAX_COMMENT_LENGTH,
    DEFAULT_MAX_COMMENTS_PER_DISTRICT,
    MAX_NOTE_LENGTH,
    DistrictNote,
)
from app.district_notes.tasks import moderate_note_by_id
from app.models import DistrictrMap, Document, DocumentCommentCreate


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


def sync_district_notes(
    document_id: str,
    notes: list[DocumentCommentCreate],
    session: Session,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Full replace-by-diff sync of a document's zone notes.

    Each note is {comment_id?, zone, text}: a comment_id that exists for this
    document AND sits in the same zone updates that row, anything else inserts,
    and existing rows not in the payload are deleted. The zone check keeps a
    stray id (a client-side placeholder that happens to parse as a real row id)
    from silently relabelling another zone's note. Notes are truncated to the
    map's length limit and capped per zone. Moderation is scheduled only for
    text that changed; the client resends every note on every save. Document
    existence is enforced upstream (the assignments endpoint 404s first) and
    by the FK.
    """
    max_note_length, max_notes_per_zone = _get_note_limits_for_document(
        document_id, session
    )
    max_note_length = min(max_note_length, MAX_NOTE_LENGTH)

    existing = {
        row.id: row
        for row in session.exec(
            select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
        )
    }

    # Normalize first: a note that is empty after truncation (blank input, or
    # a map with comment_length_limit=0 or comment_count_limit=0, the
    # supported "descriptions disabled" configs) is treated as a deletion, NOT
    # sent to the DB where the note_not_empty CHECK would 500 the whole save.
    normalized: list[tuple[DocumentCommentCreate, str]] = []
    for n in notes:
        if n.zone is None or max_notes_per_zone <= 0:
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
        row = existing.get(n.comment_id) if n.comment_id is not None else None
        if row is not None and row.zone == n.zone:
            changed = row.note != text
            if changed:
                session.execute(
                    update(DistrictNote)
                    .where(col(DistrictNote.id) == row.id)
                    .values(note=text)
                )
            note_id = row.id
        else:
            changed = True
            new_note = DistrictNote(document_id=document_id, zone=n.zone, note=text)
            session.add(new_note)
            session.flush()
            note_id = new_note.id
        kept_ids.add(note_id)
        if background_tasks and changed:
            background_tasks.add_task(moderate_note_by_id, note_id, text)

    to_delete = set(existing) - kept_ids
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
