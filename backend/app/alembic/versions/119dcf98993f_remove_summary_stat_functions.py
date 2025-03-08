"""remove summary stat functions

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
        "get_summary_p1_totals",
        "get_summary_stats_p1",
        "get_summary_p4_totals",
        "get_summary_stats_p4",
    ]:
        op.execute(f"DROP FUNCTION IF EXISTS {udf} CASCADE")


def downgrade() -> None:
    pass
