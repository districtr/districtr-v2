"""Add unshatter UDF

Revision ID: 65a4fc0a727d
Revises: 5ab466c5650a
Create Date: 2024-10-28 14:59:54.506026

"""

from typing import Sequence, Union

from alembic import op

from pathlib import Path

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


# revision identifiers, used by Alembic.
revision: str = "65a4fc0a727d"
down_revision: Union[str, None] = "167892041d95"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for file_name in [
        "unshatter_parent.sql",
    ]:
        with open(SQL_PATH / file_name, "r") as f:
            sql = f.read()
            op.execute(sql)


def downgrade() -> None:
    for func_name in [
        "unshatter_parent",
    ]:
        op.execute(f"DROP FUNCTION IF EXISTS {func_name}")
