"""add overlay layers

Revision ID: add_overlay_layers
Revises: 5600a4bfe3c4
Create Date: 2026-01-22

"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "24137793FE9B"
down_revision: str | None = "5600a4bfe3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create overlay table
    op.create_table(
        "overlay",
        sa.Column("overlay_id", UUID(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "data_type",
            sa.Enum("geojson", "pmtiles", name="overlaydatatype"),
            nullable=False,
        ),
        sa.Column(
            "layer_type",
            sa.Enum("fill", "line", "text", name="overlaylayertype"),
            nullable=False,
        ),
        sa.Column("custom_style", JSONB, nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("source_layer", sa.String(), nullable=True),
        sa.Column("id_property", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # Junction table: map <-> overlay many-to-many
    op.create_table(
        "districtrmap_overlays",
        sa.Column(
            "districtr_map_id",
            UUID(),
            sa.ForeignKey("districtrmap.uuid", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "overlay_id",
            UUID(),
            sa.ForeignKey("overlay.overlay_id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    op.create_index(
        "idx_districtrmap_overlays_overlay_id",
        "districtrmap_overlays",
        ["overlay_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_districtrmap_overlays_overlay_id",
        table_name="districtrmap_overlays",
    )
    op.drop_table("districtrmap_overlays")
    op.drop_table("overlay")

    # Drop enum types
    op.execute(sa.text("DROP TYPE IF EXISTS overlaylayertype"))
    op.execute(sa.text("DROP TYPE IF EXISTS overlaydatatype"))
