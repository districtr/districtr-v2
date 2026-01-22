"""add overlay layers

Revision ID: add_overlay_layers
Revises: 0db008690d60
Create Date: 2026-01-22

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID, ARRAY

# revision identifiers, used by Alembic.
revision: str = "add_overlay_layers"
down_revision: Union[str, None] = "0db008690d60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types, but only if not exists to avoid DuplicateObject errors
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'overlaydatatype') THEN
                CREATE TYPE overlaydatatype AS ENUM ('geojson', 'pmtiles');
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'overlaylayertype') THEN
                CREATE TYPE overlaylayertype AS ENUM ('fill', 'line', 'text');
            END IF;
        END
        $$;
        """
    )

    # Create overlay table
    op.create_table(
        "overlay",
        sa.Column("overlay_id", UUID(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "data_type",
            sa.Enum("geojson", "pmtiles", name="overlaydatatype", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "layer_type",
            sa.Enum("fill", "line", "text", name="overlaylayertype", create_type=False),
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

    # Add overlay_ids column to districtrmap
    op.add_column(
        "districtrmap", sa.Column("overlay_ids", ARRAY(UUID()), nullable=True)
    )


def downgrade() -> None:
    # Drop overlay_ids column from districtrmap
    op.drop_column("districtrmap", "overlay_ids")

    # Drop overlay table
    op.drop_table("overlay")

    # Drop enum types (still check for existence before dropping)
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'overlaylayertype') THEN
                DROP TYPE overlaylayertype;
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'overlaydatatype') THEN
                DROP TYPE overlaydatatype;
            END IF;
        END
        $$;
        """
    )
