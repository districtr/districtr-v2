"""bugfix_find_unassigned

Revision ID: 3bd06553411c
Revises: c41fbcfff93e
Create Date: 2025-02-01 19:58:17.210578

"""

from typing import Sequence, Union
from pathlib import Path

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "3bd06553411c"
down_revision: Union[str, None] = "c41fbcfff93e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


def upgrade() -> None:
    # run get_unassigned_bboxes_udf.sql
    with open(SQL_PATH / "find_unassigned_areas_udf_rev2.sql") as f:
        sql = f.read()
        op.execute(sa.text(sql))


def downgrade() -> None:
    # run get_unassigned_bboxes_udf.sql
    with open(SQL_PATH / "find_unassigned_areas_udf.sql") as f:
        sql = f.read()
        op.execute(sa.text(sql))
