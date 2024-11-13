"""summary stat udfs

Revision ID: f86991e63a62
Revises: c3541f016d35
Create Date: 2024-11-10 14:17:46.753393

"""

from typing import Sequence, Union

from alembic import op
from pathlib import Path
from app.constants import SQL_DIR


# revision identifiers, used by Alembic.
revision: str = "f86991e63a62"
down_revision: Union[str, None] = "c3541f016d35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for udf in ["summary_stats_p1.sql", "summary_stats_pop_totals.sql"]:
        with Path(SQL_DIR, udf).open() as f:
            sql = f.read()
            op.execute(sql)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS get_summary_stats_p1")
    op.execute("DROP FUNCTION IF EXISTS get_summary_stats_pop_totals")
