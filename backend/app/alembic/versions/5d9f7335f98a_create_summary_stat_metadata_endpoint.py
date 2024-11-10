"""create summary stat metadata endpoint

Revision ID: 5d9f7335f98a
Revises: 8437ce954087
Create Date: 2024-09-11 10:15:07.929311

"""

from typing import Sequence, Union

from alembic import op
from pathlib import Path


# revision identifiers, used by Alembic.
revision: str = "5d9f7335f98a"
down_revision: Union[str, None] = "dc391733e10a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


def upgrade() -> None:
    with open(SQL_PATH / "available_summary_stat_udf.sql", "r") as f:
        sql = f.read()
        op.execute(sql)


def downgrade() -> None:
    sql = "DROP FUNCTION IF EXISTS get_available_summary_stats;"
    op.execute(sql)
