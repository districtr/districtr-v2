"""Add groups to CMS

Revision ID: b72e5f198a64
Revises: af62f0e0276b
Create Date: 2025-05-22 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "b72e5f198a64"
down_revision: Union[str, None] = "af62f0e0276b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create groups_content table in CMS schema
    op.create_table(
        "groups_content",
        sa.Column("id", sa.UUID(), nullable=False, unique=True),
        sa.Column("slug", sa.String(), nullable=False, index=True),
        sa.Column("language", sa.String(), nullable=False, index=True),
        sa.Column("draft_content", JSONB, nullable=True),
        sa.Column("published_content", JSONB, nullable=True),
        sa.Column("group_slugs", sa.ARRAY(sa.String), nullable=True, index=True),
        sa.Column("author", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "language", name="groups_slug_language_unique"),
        schema="cms",
    )


def downgrade() -> None:
    # Drop groups_content table
    op.drop_table("groups_content", schema="cms")
