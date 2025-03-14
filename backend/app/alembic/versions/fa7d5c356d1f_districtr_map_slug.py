"""districtr_map_slug

Revision ID: fa7d5c356d1f
Revises: 4b0aec5f8350
Create Date: 2025-03-13 22:24:40.076745

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "fa7d5c356d1f"
down_revision: Union[str, None] = "4b0aec5f8350"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    udfs_to_drop = [
        "create_districtr_map(VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, VARCHAR)",
        "create_districtr_map(VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, VARCHAR, BOOLEAN)",
        "create_document(TEXT)",
        "shatter_parent(UUID, VARCHAR[])",
        "unshatter_parent(UUID, VARCHAR[], INTEGER)",
        "get_total_population(UUID)",
        "get_zone_assignments_geo(UUID)",
        "get_block_assignments(UUID)",
        "get_block_assignments_geo(UUID)",
        "get_unassigned_bboxes(UUID, VARCHAR[])",
        "get_summary_stats_p1(UUID)",
        "get_summary_stats_p4(UUID)",
        "get_unassigned_bboxes_slow(UUID)",
    ]
    for udf in udfs_to_drop:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {udf}"))

    udfs = [
        "create_districtr_map_udf",
        "create_document_udf",
        "shatter_parent",
        "unshatter_parent",
        "total_pop_udf",
        "export_zone_assignments_geo",
        "get_block_assignments_geo",
        "get_block_assignments_geo",
        "get_unassigned_bboxes_udf_rev2",
        "summary_stats_p1",
        "summary_stats_p4",
        "ALT_get_unassigned_bbox_udf",
    ]
    for udf in udfs:
        with open(settings.SQL_DIR / f"{udf}.sql", "r") as f:
            sql = f.read()
        op.execute(sa.text(sql))

    op.add_column(
        "districtrmap",
        sa.Column(
            "districtr_map_slug", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    op.add_column(
        "document",
        sa.Column(
            "districtr_map_slug", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
        schema="document",
    )

    stmt = sa.text(
        "UPDATE districtrmap SET districtr_map_slug = gerrydb_table_name WHERE districtr_map_slug IS NULL"
    )
    op.execute(stmt)

    stmt = sa.text(
        "UPDATE document.document SET districtr_map_slug = gerrydb_table WHERE districtr_map_slug IS NULL"
    )
    op.execute(stmt)

    op.alter_column("districtrmap", "districtr_map_slug", nullable=False)
    # op.alter_column('document', 'districtr_map_slug', nullable=False, schema="document")

    op.drop_constraint(
        "districtrmap_gerrydb_table_name_key", "districtrmap", type_="unique"
    )
    op.create_unique_constraint(
        "unique_districtr_map_slug", "districtrmap", ["districtr_map_slug"]
    )


def downgrade() -> None:
    op.drop_constraint("unique_districtr_map_slug", "districtrmap", type_="unique")
    op.create_unique_constraint(
        "districtrmap_gerrydb_table_name_key", "districtrmap", ["gerrydb_table_name"]
    )
    op.drop_column("districtrmap", "districtr_map_slug")
    op.drop_column("document", "districtr_map_slug", schema="document")

    # Add previous UDFs
