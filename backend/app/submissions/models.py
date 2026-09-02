"""The flexible submissions schema.

Three tables in the `comments` schema replace the rigid
comment/commenter/tag trio:

- form_configs: one row per portal (portal_id == the CMS TagPage's
  default-locale slug), declaring which registry fields the portal's form
  shows, which are required, and which teams administer its submissions.
  Edited by the CMS through a managed=False mirror.
- submissions: one row per submission. `id` is the public/admin handle;
  `submission_id` (UUID) is the write capability for the draft→finalize flow
  and is never listed publicly. Visibility is `status='submitted' AND NOT
  hidden`; `nsfw` is served to the frontend, which blurs.
- submissions_content: sparse field/value rows (the EAV part). Empty values
  are simply not inserted.

Statuses are VARCHAR + CHECK, deliberately not native enums — evolving the
legacy review_status_enum required a migration per value and is part of why
the old schema is being dropped.
"""

from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import BigInteger, Boolean, Text, text
from sqlmodel import (
    TIMESTAMP,
    CheckConstraint,
    Column,
    Field,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY

from app.core.models import UUIDType

from app.constants import COMMENTS_SCHEMA
from app.core.models import SQLModel, TimeStampMixin
from app.models import Document


class FormConfig(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __tablename__ = "form_configs"
    __table_args__ = (
        CheckConstraint("LENGTH(TRIM(portal_id)) > 0", name="portal_not_empty"),
        CheckConstraint("required_fields <@ fields", name="required_subset_of_fields"),
    )

    id: int = Field(
        sa_column=Column(Integer, nullable=False, autoincrement=True, primary_key=True)
    )
    portal_id: str = Field(
        sa_column=Column(String(255), nullable=False, unique=True, index=True)
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    fields: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            ARRAY(String(64)), nullable=False, server_default=text("'{}'")
        ),
    )
    required_fields: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            ARRAY(String(64)), nullable=False, server_default=text("'{}'")
        ),
    )
    require_email_confirm: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    admin_teams: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            ARRAY(String(255)), nullable=False, server_default=text("'{}'")
        ),
    )


class SubmissionStatus:
    draft = "draft"
    submitted = "submitted"


class Submission(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __tablename__ = "submissions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'submitted')", name="submissions_status_valid"
        ),
        CheckConstraint(
            "(status = 'submitted') = (submitted_at IS NOT NULL)",
            name="submitted_iff_timestamp",
        ),
        Index(
            "idx_submissions_portal_status_created", "portal_id", "status", "created_at"
        ),
        Index("idx_submissions_tags", "tags", postgresql_using="gin"),
        Index("idx_submissions_map_public_id", "map_public_id"),
        Index(
            "idx_submissions_drafts",
            "status",
            "created_at",
            postgresql_where=text("status = 'draft'"),
        ),
    )

    id: int = Field(
        sa_column=Column(
            BigInteger, nullable=False, autoincrement=True, primary_key=True
        )
    )
    submission_id: str = Field(
        default=None,
        sa_column=Column(
            UUIDType,
            nullable=False,
            unique=True,
            server_default=text("gen_random_uuid()"),
        ),
    )
    portal_id: str = Field(
        sa_column=Column(
            ForeignKey(
                FormConfig.portal_id,
                onupdate="CASCADE",
                ondelete="RESTRICT",
            ),
            nullable=False,
        )
    )
    map_public_id: int | None = Field(
        default=None,
        sa_column=Column(
            ForeignKey(Document.public_id, ondelete="SET NULL"),
            nullable=True,
        ),
    )
    tags: list[str] = Field(
        default_factory=list,
        sa_column=Column(
            ARRAY(String(255)), nullable=False, server_default=text("'{}'")
        ),
    )
    status: str = Field(
        default=SubmissionStatus.submitted,
        sa_column=Column(
            String(16), nullable=False, server_default=SubmissionStatus.submitted
        ),
    )
    submitted_at: datetime | None = Field(
        default=None, sa_column=Column(TIMESTAMP(timezone=True), nullable=True)
    )
    nsfw: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    hidden: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    # True when the map is a submission-owned frozen clone; false for live
    # references (drafts, converted legacy rows, auto-collect modes).
    # Takedown may only demote the draft_status of clones.
    map_is_clone: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    flagged: bool = Field(
        default=False,
        sa_column=Column(
            Boolean, nullable=False, default=False, server_default="false"
        ),
    )
    moderation_score: float | None = Field(
        default=None, sa_column=Column(Float, nullable=True)
    )


class SubmissionContent(SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __tablename__ = "submissions_content"
    __table_args__ = (
        UniqueConstraint("submission_id", "field", name="content_unique_per_field"),
        CheckConstraint("LENGTH(field) > 0", name="field_not_empty"),
        CheckConstraint(
            "LENGTH(TRIM(value)) > 0 AND LENGTH(value) <= 5000",
            name="value_not_empty_and_bounded",
        ),
        # ponytail: no index on (field, value) — a btree over 5000-char values
        # exceeds the index-row limit; add an expression index (field,
        # left(value, N)) if location filtering ever needs it at scale.
    )

    id: int = Field(
        sa_column=Column(
            BigInteger, nullable=False, autoincrement=True, primary_key=True
        )
    )
    submission_id: int = Field(
        sa_column=Column(
            ForeignKey(Submission.id, ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    field: str = Field(sa_column=Column(String(64), nullable=False))
    value: str = Field(sa_column=Column(Text, nullable=False))


# ---------------------------------------------------------------------------
# Wire models
# ---------------------------------------------------------------------------


class SubmissionCreate(BaseModel):
    portal_id: str
    fields: dict[str, str] = {}
    tags: list[str] = []
    # A map link/id to attach; the referenced plan is cloned at submission
    # time and the clone's public_id is stored, so the gallery entry is
    # frozen and nobody holds the clone's edit UUID.
    map_ref: str | int | None = None
    turnstile_token: str


class SubmissionFinalize(BaseModel):
    """Body for finalizing a draft submission (the map-autosubmit flow)."""

    fields: dict[str, str] = {}
    tags: list[str] = []
    turnstile_token: str


class SubmissionCreated(BaseModel):
    id: int
    submission_id: str


class SubmissionPublic(BaseModel):
    id: int
    portal_id: str
    tags: list[str]
    nsfw: bool
    map_public_id: int | None = None
    created_at: datetime | None = None
    submitted_at: datetime | None = None
    fields: dict[str, str] = {}


class SubmissionAdmin(SubmissionPublic):
    status: str
    hidden: bool
    flagged: bool
    moderation_score: float | None = None


class FormConfigPublic(BaseModel):
    portal_id: str
    name: str
    fields: list[str]
    required_fields: list[str]
    require_email_confirm: bool


class FlagSubmissionRequest(BaseModel):
    id: int


class NsfwUpdate(BaseModel):
    nsfw: bool


class HiddenUpdate(BaseModel):
    hidden: bool
