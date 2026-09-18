"""Per-zone map notes ("district notes"), split out of the form-comment tables.

These are the notes a map author attaches to a district or community while
editing (synced wholesale on every PUT /api/assignments), not public form
submissions. They used to share comments.comment + comments.document_comment
with written testimony; that coupling is what made the comment tables hard to
replace. This table is theirs alone.

Moderation is automatic-only (tasks.py): a background task scores the text and
sets `nsfw`; the public read path shows a placeholder for nsfw notes while edit
access always sees the real text. There is no human review surface.

Models only: alembic/env.py imports this module to build target_metadata, so
it must not construct settings or an engine as a side effect.
"""

from sqlmodel import (
    CheckConstraint,
    Column,
    Field,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
)
from sqlalchemy import Boolean

from app.constants import COMMENTS_SCHEMA
from app.core.models import SQLModel, TimeStampMixin
from app.models import Document

DEFAULT_MAX_COMMENT_LENGTH = 240
DEFAULT_MAX_COMMENTS_PER_DISTRICT = 1
# The column's width. A map's comment_length_limit is clamped to this so an
# oversized CMS value can't turn a save into a DataError.
MAX_NOTE_LENGTH = 5000


class DistrictNote(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __tablename__ = "district_notes"
    __table_args__ = (
        CheckConstraint("zone >= 0", name="zone_non_negative"),
        CheckConstraint("LENGTH(TRIM(note)) > 0", name="note_not_empty"),
        # Every query filters on document_id alone.
        Index("idx_district_notes_document", "document_id"),
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
    note: str = Field(sa_column=Column(String(MAX_NOTE_LENGTH), nullable=False))
    nsfw: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    moderation_score: float = Field(
        sa_column=Column(Float, nullable=True, default=None)
    )
