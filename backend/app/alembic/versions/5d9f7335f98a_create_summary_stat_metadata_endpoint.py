"""create summary stat metadata endpoint

Revision ID: 5d9f7335f98a
Revises: 65a4fc0a727d
Create Date: 2024-09-11 10:15:07.929311

"""

from typing import Sequence, Union

from alembic import op
from app.constants import SQL_DIR


# revision identifiers, used by Alembic.
revision: str = "5d9f7335f98a"
down_revision: Union[str, None] = "65a4fc0a727d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with open(SQL_DIR / "available_summary_stat_udf.sql", "r") as f:
        sql = f.read()
        op.execute(sql)


def downgrade() -> None:
    sql = "DROP FUNCTION IF EXISTS get_available_summary_stats;"
    op.execute(sql)
