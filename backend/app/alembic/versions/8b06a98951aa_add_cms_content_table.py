"""add_cms_content_table

Revision ID: 8b06a98951aa
Revises: 518ab28c5fd6
Create Date: 2025-03-25 14:07:52.761319

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from app.models import UUIDType
from sqlmodel.sql.sqltypes import AutoString

# revision identifiers, used by Alembic.
revision: str = "8b06a98951aa"
down_revision: Union[str, None] = "518ab28c5fd6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the CMS content table
    op.create_table(
        "cms_content",
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
        sa.Column("id", UUIDType(), nullable=False),
        sa.Column("slug", AutoString(), nullable=False),
        sa.Column("districtr_map_slug", AutoString(), nullable=True),
        sa.Column("language", AutoString(), nullable=False, default="en"),
        sa.Column("draft_content", JSONB, nullable=True),
        sa.Column("published_content", JSONB, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "language", name="slug_language_unique"),
        sa.ForeignKeyConstraint(
            ["districtr_map_slug"], ["districtrmap.districtr_map_slug"]
        ),
    )

    # Create indices for faster lookups
    op.create_index("idx_cms_content_slug", "cms_content", ["slug"])
    op.create_index(
        "idx_cms_content_districtr_map_slug", "cms_content", ["districtr_map_slug"]
    )
    op.create_index("idx_cms_content_language", "cms_content", ["language"])


def downgrade() -> None:
    # Drop indexes first
    op.drop_index("idx_cms_content_language")
    op.drop_index("idx_cms_content_districtr_map_slug")
    op.drop_index("idx_cms_content_slug")

    # Then drop the table
    op.drop_table("cms_content")
