"""update summary stat functions

Revision ID: 119dcf98993f
Revises: f36266d50cf7
Create Date: 2025-02-21 20:49:39.037016

"""

from typing import Sequence, Union

from alembic import op
from pathlib import Path
from app.constants import SQL_DIR


# revision identifiers, used by Alembic.
revision: str = "119dcf98993f"
down_revision: Union[str, None] = "f36266d50cf7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for udf in [
        "summary_stats_p1_rev2.sql",
        "summary_stats_p1_totals_rev2.sql",
        "summary_stats_p4_rev2.sql",
        "summary_stats_p4_totals_rev2.sql",
    ]:
        with Path(SQL_DIR, udf).open() as f:
            sql = f.read()
            op.execute(sql)


def downgrade() -> None:
    for udf in [
        "summary_stats_p1.sql",
        "summary_stats_p1_totals.sql",
        "summary_stats_p4.sql",
        "summary_stats_p4_totals.sql",
    ]:
        with Path(SQL_DIR, udf).open() as f:
            sql = f.read()
            op.execute(sql)
