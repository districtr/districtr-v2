"""missing two or more races

Revision ID: d90c9a1a246b
Revises: 2494caf34886
Create Date: 2024-11-18 23:56:24.881723

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.constants import SQL_DIR
from pathlib import Path


# revision identifiers, used by Alembic.
revision: str = "d90c9a1a246b"
down_revision: Union[str, None] = "2494caf34886"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for udf in [
        "available_summary_stat_udf.sql",
        "summary_stats_p1.sql",
        "summary_stats_p1_totals.sql",
        "summary_stats_p4.sql",
        "summary_stats_p4_totals.sql",
    ]:
        with Path(SQL_DIR, udf).open() as f:
            sql = f.read()
            op.execute(sql)

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


def downgrade() -> None:
    # Since the previous migraiton touching this logic was buggy, not going to
    # to write a downgrade for it.
    pass
