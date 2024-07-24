"""create udfs

Revision ID: b7adbf498feb
Revises: 48a91c29aae9
Create Date: 2024-07-23 23:44:08.215988

"""

from typing import Sequence, Union
from pathlib import Path
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b7adbf498feb"
down_revision: Union[str, None] = "48a91c29aae9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


def upgrade() -> None:
    # create udfs
    for file_name in [
        "create_assignment_partition_sql_udf.sql",
        "create_document_udf.sql",
    ]:
        with open(SQL_PATH / file_name, "r") as f:
            sql = f.read()
            op.execute(sql)


def downgrade() -> None:
    # delete udfs
    for func_name in ["create_assignment_partition_sql", "create_document"]:
        sql = f"DROP FUNCTION IF EXISTS {func_name}"
        op.execute(sql)
