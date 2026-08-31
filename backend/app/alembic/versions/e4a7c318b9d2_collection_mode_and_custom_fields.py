"""Portal collection modes and custom form questions

- form_configs.collection_mode: how a portal collects map submissions.
  'internal'   — auto-collected, admin gallery only, never publicly listed
  'auto_public'— auto-collected into the public gallery (live references)
  'prompt'     — SubmitToPortalModal on ready-to-share (clone-at-submission)
  'form'       — manual form block only
  Default 'prompt' matches every existing portal's behavior; no backfill.

- comments.form_fields_custom: admin-defined questions beyond the fixed
  field registry (text / textarea only). Keys are 'custom_'-prefixed so they
  can never collide with registry names; values land in submissions_content
  like any other field.

Revision ID: e4a7c318b9d2
Revises: d8f1b52c96e3
Create Date: 2026-08-31

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e4a7c318b9d2"
down_revision: Union[str, None] = "d8f1b52c96e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "form_configs",
        sa.Column(
            "collection_mode",
            sa.String(length=16),
            server_default="prompt",
            nullable=False,
        ),
        schema="comments",
    )
    op.create_check_constraint(
        "collection_mode_valid",
        "form_configs",
        "collection_mode IN ('internal', 'auto_public', 'prompt', 'form')",
        schema="comments",
    )

    op.create_table(
        "form_fields_custom",
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
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("portal_id", sa.String(length=255), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("field_type", sa.String(length=16), nullable=False),
        sa.Column("required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("key LIKE 'custom\\_%'", name="key_prefixed"),
        sa.CheckConstraint("LENGTH(TRIM(label)) > 0", name="label_not_empty"),
        sa.CheckConstraint(
            "field_type IN ('text', 'textarea')", name="field_type_valid"
        ),
        sa.ForeignKeyConstraint(
            ["portal_id"],
            ["comments.form_configs.portal_id"],
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("portal_id", "key", name="custom_field_unique_per_portal"),
        schema="comments",
    )
    op.create_index(
        "idx_form_fields_custom_portal",
        "form_fields_custom",
        ["portal_id"],
        schema="comments",
    )


def downgrade() -> None:
    op.drop_table("form_fields_custom", schema="comments")
    op.drop_constraint(
        "collection_mode_valid", "form_configs", schema="comments", type_="check"
    )
    op.drop_column("form_configs", "collection_mode", schema="comments")
