"""update get block assignments

Revision ID: e9435b616749
Revises: 119dcf98993f
Create Date: 2025-03-09 11:45:13.064296

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.core.config import settings


# revision identifiers, used by Alembic.
revision: str = "e9435b616749"
down_revision: Union[str, None] = "4b0aec5f8350"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SQL_DIR = settings.SQL_DIR


def upgrade() -> None:
    for udf, arg_types in [
        ("get_block_assignments", "UUID"),
        ("get_block_assignments_geo", "UUID"),
        ("get_block_zone_assignments", "UUID INTEGER[]"),
        ("get_block_zone_assignments_geo", "UUID INTEGER[]"),
    ]:
        with open(f"{SQL_DIR}/{udf}.sql", "r") as f:
            sql = f.read()
        # Need to drop the function before creating it again because the function signature has changed
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {udf}({arg_types});"))
        op.execute(sa.text(sql))


def downgrade() -> None:
    pass
