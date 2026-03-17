"""add document-level map_type

Revision ID: 3b7e6f2c9d41
Revises: dfc8a42b3632
Create Date: 2026-03-17 12:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "3b7e6f2c9d41"
down_revision: Union[str, None] = "dfc8a42b3632"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


maptype_enum = postgresql.ENUM(
    "default", "local", "community", name="maptype", create_type=False
)


def upgrade() -> None:
    # PostgreSQL does not allow a newly-added enum value to be used until the
    # transaction that added it has committed. Run the ALTER TYPE in Alembic's
    # autocommit block so the backfill below can safely reference 'community'.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE maptype ADD VALUE IF NOT EXISTS 'community'"))

    op.add_column(
        "document",
        sa.Column("map_type", maptype_enum, nullable=True, server_default="default"),
        schema="document",
    )

    op.execute(
        sa.text(
            """
            UPDATE document.document AS d
            SET map_type = CASE
                WHEN d.community_metadata_list IS NOT NULL
                    OR d.num_communities IS NOT NULL
                    OR EXISTS (
                        SELECT 1
                        FROM document.community_assignments AS ca
                        WHERE ca.document_id = d.document_id
                    )
                THEN 'community'::maptype
                ELSE COALESCE(dm.map_type, 'default'::maptype)
            END
            FROM public.districtrmap AS dm
            WHERE dm.districtr_map_slug = d.districtr_map_slug
            """
        )
    )

    op.alter_column("document", "map_type", nullable=False, schema="document")


def downgrade() -> None:
    op.drop_column("document", "map_type", schema="document")
