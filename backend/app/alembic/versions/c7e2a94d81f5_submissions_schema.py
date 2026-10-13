"""Flexible submissions schema: form_configs, submissions, submissions_content

The form-builder replacement for the rigid comment/commenter/tag tables
(which stay in place until a later revision drops them — the two systems run
in parallel during the transition):

- form_configs: one row per portal; which registry fields its form shows,
  which are required, and which teams administer its submissions.
- submissions: one row per submission. Surrogate bigint id is the
  public/admin handle; submission_id UUID is the draft-finalize write
  capability. No approval gate: visibility is status/hidden, nsfw is the
  moderation blur bit.
- submissions_content: sparse field/value rows, one per non-empty field.

Statuses are VARCHAR + CHECK, deliberately not a native enum.

Revision ID: c7e2a94d81f5
Revises: b3d9f47a25c1
Create Date: 2026-08-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

from app.core.models import UUIDType

# revision identifiers, used by Alembic.
revision: str = "c7e2a94d81f5"
down_revision: Union[str, None] = "b3d9f47a25c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps():
    return [
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "form_configs",
        *_timestamps(),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("portal_id", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "fields",
            ARRAY(sa.String(length=64)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "required_fields",
            ARRAY(sa.String(length=64)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "require_email_confirm",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column(
            "admin_teams",
            ARRAY(sa.String(length=255)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.CheckConstraint("LENGTH(TRIM(portal_id)) > 0", name="portal_not_empty"),
        sa.CheckConstraint(
            "required_fields <@ fields", name="required_subset_of_fields"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("portal_id"),
        schema="comments",
    )
    op.create_index(
        "ix_comments_form_configs_portal_id",
        "form_configs",
        ["portal_id"],
        schema="comments",
    )

    op.create_table(
        "submissions",
        *_timestamps(),
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "submission_id",
            UUIDType,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("portal_id", sa.String(length=255), nullable=False),
        sa.Column("map_public_id", sa.Integer(), nullable=True),
        sa.Column(
            "tags",
            ARRAY(sa.String(length=255)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="submitted",
            nullable=False,
        ),
        sa.Column("submitted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("nsfw", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("hidden", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("flagged", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("moderation_score", sa.Float(), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted')", name="submissions_status_valid"
        ),
        sa.CheckConstraint(
            "(status = 'submitted') = (submitted_at IS NOT NULL)",
            name="submitted_iff_timestamp",
        ),
        sa.ForeignKeyConstraint(
            ["portal_id"],
            ["comments.form_configs.portal_id"],
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["map_public_id"],
            ["document.document.public_id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id"),
        schema="comments",
    )
    op.create_index(
        "idx_submissions_portal_status_created",
        "submissions",
        ["portal_id", "status", "created_at"],
        schema="comments",
    )
    op.create_index(
        "idx_submissions_tags",
        "submissions",
        ["tags"],
        schema="comments",
        postgresql_using="gin",
    )
    op.create_index(
        "idx_submissions_map_public_id",
        "submissions",
        ["map_public_id"],
        schema="comments",
    )
    op.create_index(
        "idx_submissions_drafts",
        "submissions",
        ["status", "created_at"],
        schema="comments",
        postgresql_where=sa.text("status = 'draft'"),
    )

    op.create_table(
        "submissions_content",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("submission_id", sa.BigInteger(), nullable=False),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.CheckConstraint("LENGTH(field) > 0", name="field_not_empty"),
        sa.CheckConstraint(
            "LENGTH(TRIM(value)) > 0 AND LENGTH(value) <= 5000",
            name="value_not_empty_and_bounded",
        ),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["comments.submissions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "field", name="content_unique_per_field"),
        schema="comments",
    )
    op.create_index(
        "ix_comments_submissions_content_submission_id",
        "submissions_content",
        ["submission_id"],
        schema="comments",
    )


def downgrade() -> None:
    op.drop_table("submissions_content", schema="comments")
    op.drop_table("submissions", schema="comments")
    op.drop_table("form_configs", schema="comments")
