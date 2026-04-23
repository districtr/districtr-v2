"""add community mode tables

Revision ID: 112a59ed50a2
Revises: da39a3ee5e6b
Create Date: 2026-03-17 07:56:56.013703

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from app.core.models import UUIDType

# revision identifiers, used by Alembic.
revision: str = "112a59ed50a2"
down_revision: Union[str, None] = "da39a3ee5e6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

maptype_enum = postgresql.ENUM(
    "default", "local", "community", name="maptype", create_type=False
)

documenttype_enum = postgresql.ENUM(
    "district", "coi", name="documenttype", create_type=False
)


def upgrade() -> None:
    # Add "community" to the maptype enum
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE maptype ADD VALUE IF NOT EXISTS 'community'"))

    # Add community columns to document
    op.add_column(
        "document",
        sa.Column("num_communities", sa.Integer(), nullable=True),
        schema="document",
    )
    op.add_column(
        "document",
        sa.Column(
            "community_metadata_list",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="document",
    )

    # Create community_assignments table
    op.create_table(
        "community_assignments",
        sa.Column("document_id", UUIDType(), nullable=False),
        sa.Column("community_id", sa.SmallInteger(), nullable=False),
        sa.Column("geo_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("document_id", "community_id", "geo_id"),
        sa.UniqueConstraint(
            "document_id",
            "community_id",
            "geo_id",
            name="document_community_geo_id_unique",
        ),
        schema="document",
        postgresql_partition_by="LIST (document_id)",
    )
    op.create_index(
        "ix_document_community_assignments_community_id",
        "community_assignments",
        ["community_id"],
        unique=False,
        schema="document",
    )
    op.create_index(
        "ix_document_community_assignments_geo_id",
        "community_assignments",
        ["geo_id"],
        unique=False,
        schema="document",
    )

    # Add document-level map_type column with backfill
    op.add_column(
        "document",
        sa.Column("map_type", maptype_enum, nullable=True, server_default="default"),
        schema="document",
    )
    # Backfill map_type for existing documents from their parent DistrictrMap.
    # The community_* branches that existed previously here were dead: num_communities,
    # community_metadata_list, and community_assignments are all introduced by this
    # same migration, so none of them can be set on existing rows at this point.
    op.execute(
        sa.text(
            """
            UPDATE document.document AS d
            SET map_type = COALESCE(dm.map_type, 'default'::maptype)
            FROM public.districtrmap AS dm
            WHERE dm.districtr_map_slug = d.districtr_map_slug
            """
        )
    )
    op.alter_column("document", "map_type", nullable=False, schema="document")

    # Add document_type enum and column
    documenttype_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "document",
        sa.Column(
            "document_type",
            documenttype_enum,
            nullable=False,
            server_default="district",
        ),
        schema="document",
    )


def downgrade() -> None:
    # Drop document_type
    op.drop_column("document", "document_type", schema="document")
    documenttype_enum.drop(op.get_bind(), checkfirst=True)

    # Drop map_type
    op.drop_column("document", "map_type", schema="document")

    # Drop community_assignments table
    op.drop_index(
        "ix_document_community_assignments_geo_id",
        table_name="community_assignments",
        schema="document",
    )
    op.drop_index(
        "ix_document_community_assignments_community_id",
        table_name="community_assignments",
        schema="document",
    )
    op.drop_table("community_assignments", schema="document")

    # Drop community columns
    op.drop_column("document", "community_metadata_list", schema="document")
    op.drop_column("document", "num_communities", schema="document")
    # ⚠️ ONE-WAY MIGRATION WARNING ⚠️
    # PostgreSQL does not support DROP VALUE on an enum type, so the 'community' value
    # added to `maptype` in upgrade() will remain after this downgrade. Running upgrade()
    # again is safe (IF NOT EXISTS), but strict equivalence with the pre-upgrade schema
    # cannot be restored without renaming + recreating the enum and rewriting every
    # column that references it. If you need a fully clean rollback, coordinate the enum
    # recreation as a separate dedicated migration.
