"""add unassigned areas udf

Revision ID: c41fbcfff93e
Revises: 0f8bbbcdd7be
Create Date: 2025-01-10 21:10:40.928856

"""

from typing import Sequence, Union
from pathlib import Path

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c41fbcfff93e"
down_revision: Union[str, None] = "0f8bbbcdd7be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


def upgrade() -> None:
    # run get_unassigned_bboxes_udf.sql
    with open(SQL_PATH / "get_unassigned_bboxes_udf.sql") as f:
        sql = f.read()
        op.execute(sa.text(sql))


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS get_unassigned_bboxes(doc_uuid uuid);")
