"""Remove summary stats

Revision ID: d38d0f766dc5
Revises: 8b06a98951aa
Create Date: 2025-04-22 19:48:30.540119

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.constants import SQL_DIR


# revision identifiers, used by Alembic.
revision: str = 'd38d0f766dc5'
down_revision: Union[str, None] = '8b06a98951aa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

summary_udfs = [
    {
        "name": "get_summary_stats_p1",
        "filepath": "summary_stats_p1.sql"
    },
    {
        "name": "get_summary_p1_totals",
        "filepath": "summary_stats_p1_totals.sql"
    },
    {
        "name": "get_summary_stats_p4",
        "filepath": "summary_stats_p4.sql"
    },
    {
        "name": "get_summary_p4_totals",
        "filepath": "summary_stats_p4_totals.sql"
    },
    {
        "name": "get_total_population",
        "filepath": "total_pop_udf_rev2.sql"
    },
    {
        "name": "get_available_summary_stats",
        "filepath": "available_summary_stat_udf_rev2.sql"
    }
]

def upgrade() -> None:
    op.drop_column("districtrmap", "available_summary_stats", schema="public")
    for udf in summary_udfs:
        op.execute(f"DROP FUNCTION IF EXISTS {udf['name']} CASCADE")
    pass


def downgrade() -> None:
    op.add_column(
        "districtrmap",
        sa.Column("available_summary_stats", sa.ARRAY(sa.VARCHAR), nullable=True),
        schema="public",
    )
    
    for udf in summary_udfs:
        op.execute(f"CREATE FUNCTION {udf['name']} RETURNS VOID AS $$\n{SQL_DIR}/{udf['filepath']}\n$$ LANGUAGE sql;")

    op.execute(
        sa.text(
            """
        UPDATE districtrmap d
        SET available_summary_stats = (
            SELECT
            CASE WHEN d.child_layer IS NOT NULL THEN
                (
                SELECT ARRAY_AGG(summary_stat) FROM get_available_summary_stats(d.child_layer)
                INTERSECT
                SELECT ARRAY_AGG(summary_stat) FROM get_available_summary_stats(d.parent_layer)
                )
            ELSE
                (SELECT ARRAY_AGG(summary_stat) FROM get_available_summary_stats(d.parent_layer))
            END
        )
    """
        )
    )
    pass
