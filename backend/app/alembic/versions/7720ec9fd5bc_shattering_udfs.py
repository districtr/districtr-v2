"""shattering udfs

Revision ID: 7720ec9fd5bc
Revises: 3f732ad6ce98
Create Date: 2024-09-09 08:43:38.992348

"""

from typing import Sequence, Union

from alembic import op
from pathlib import Path

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


# revision identifiers, used by Alembic.
revision: str = "7720ec9fd5bc"
down_revision: Union[str, None] = "3f732ad6ce98"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create udfs
    # TODO!: When being merged, these should be added statically.
    for file_name in [
        "parent_child_relationships.sql",
    ]:
        with open(SQL_PATH / file_name, "r") as f:
            sql = f.read()
            op.execute(sql)


def downgrade() -> None:
    # delete udfs
    for func_name in ["add_parent_child_relationships"]:
        sql = f"DROP FUNCTION IF EXISTS {func_name}"
        op.execute(sql)
