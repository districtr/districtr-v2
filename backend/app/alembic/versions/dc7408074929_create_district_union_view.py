"""create_district_union_view

Revision ID: dc7408074929
Revises: 846afa42e0cb
Create Date: 2025-08-22 13:04:25.907660

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry


# revision identifiers, used by Alembic.
revision: str = "dc7408074929"
down_revision: Union[str, None] = "846afa42e0cb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the district_unions materialized view table with partitioning
    op.create_table(
        "district_unions",
        sa.Column("document_id", UUID, nullable=False),
        sa.Column("zone", sa.Integer, nullable=False),
        sa.Column("geometry", Geometry("MULTIPOLYGON", 4326), nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")
        ),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")
        ),
        sa.PrimaryKeyConstraint("document_id", "zone"),
        postgresql_partition_by="LIST (document_id)",
        schema="document",
    )

    # Create an index on the geometry column for spatial queries using GIST
    op.execute(
        sa.text("""
        CREATE INDEX IF NOT EXISTS idx_district_unions_geometry 
        ON document.district_unions USING GIST (geometry)
    """)
    )

    # Create an index on updated_at for efficient queries
    op.execute(
        sa.text("""
        CREATE INDEX IF NOT EXISTS idx_district_unions_updated_at 
        ON document.district_unions (updated_at DESC)
    """)
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS document.idx_district_unions_geometry"))
    op.execute(sa.text("DROP INDEX IF EXISTS document.idx_district_unions_updated_at"))
    op.drop_table("district_unions", schema="document")
