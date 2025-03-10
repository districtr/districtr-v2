"""new column schema

Revision ID: 6d83465440a6
Revises: 119dcf98993f
Create Date: 2025-03-10 14:45:51.980701

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.constants import SQL_DIR


# revision identifiers, used by Alembic.
revision: str = "6d83465440a6"
down_revision: Union[str, None] = "119dcf98993f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with open(f"{SQL_DIR}/available_summary_stat_udf_rev2.sql") as f:
        query = f.read()
    op.execute(sa.text(query))

    pass


def downgrade() -> None:
    with open(f"{SQL_DIR}/available_summary_stat_udf.sql") as f:
        query = f.read()
    op.execute(sa.text(query))
    pass
