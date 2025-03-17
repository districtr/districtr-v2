"""districtr_map_slug

Revision ID: fa7d5c356d1f
Revises: 6d83465440a6
Create Date: 2025-03-13 22:24:40.076745

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "fa7d5c356d1f"
down_revision: str = "6d83465440a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# UDFs with function parameter name changes and matching parameter type signatures
# can't be replaced without first being dropped and recreated with the new parameters
udfs_to_drop = [
    "create_districtr_map(VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, VARCHAR)",
    "create_districtr_map(VARCHAR, VARCHAR, INTEGER, VARCHAR, VARCHAR, VARCHAR, BOOLEAN)",
    "create_document(TEXT)",
]

udfs = [
    "create_districtr_map_udf.sql",
    "create_document_udf.sql",
    "shatter_parent.sql",
    "unshatter_parent.sql",
    "total_pop_udf.sql",
    "total_pop_udf_rev2.sql",
    "export_zone_assignments_geo.sql",
    "get_block_assignments.sql",
    "get_block_assignments_geo.sql",
    "get_block_assignments_geo.sql",
    "get_block_zone_assignments.sql",
    "get_block_zone_assignments_geo.sql",
    "get_unassigned_bboxes_udf_rev2.sql",
    "summary_stats_p1.sql",
    "summary_stats_p4.sql",
]


def upgrade() -> None:
    for udf in udfs_to_drop:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {udf}"))

    for udf in udfs:
        with open(settings.SQL_DIR / udf, "r") as f:
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

    op.drop_constraint(
        "districtrmap_gerrydb_table_name_key", "districtrmap", type_="unique"
    )
    op.create_unique_constraint(
        "unique_districtr_map_slug", "districtrmap", ["districtr_map_slug"]
    )


def downgrade() -> None:
    op.drop_constraint("unique_districtr_map_slug", "districtrmap", type_="unique")

    # Drop newest maps with duplicate gerrydb_table_name
    get_repeated_stmt = sa.text("""select uuid from (
        select
            uuid,
            row_number() over (partition by gerrydb_table_name order by created_at asc) as row_num
        from districtrmap
    ) as subquery
    where row_num > 1""")

    conn = op.get_bind()
    repeated = conn.execute(get_repeated_stmt).scalars().all()

    if repeated:
        uuids = [str(u) for u in repeated]
        op.execute(
            sa.text(
                f"DELETE FROM parentchildedges edges WHERE edges.districtr_map IN ('{', '.join(uuids)}')"
            )
        )
        op.execute(
            sa.text(f"DELETE FROM districtrmap WHERE uuid IN ('{', '.join(uuids)}')")
        )

    op.create_unique_constraint(
        "districtrmap_gerrydb_table_name_key", "districtrmap", ["gerrydb_table_name"]
    )
    op.drop_column("districtrmap", "districtr_map_slug")
    op.drop_column("document", "districtr_map_slug", schema="document")

    for udf in udfs_to_drop:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {udf}"))

    for udf in udfs:
        with open(settings.SQL_DIR / "versions" / down_revision / udf, "r") as f:
            sql = f.read()
        op.execute(sa.text(sql))
