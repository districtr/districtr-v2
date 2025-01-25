"""export zone assignments

Revision ID: 552ac8c1defd
Revises: 0f8bbbcdd7be
Create Date: 2025-01-19 19:51:42.117991

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.main import settings


# revision identifiers, used by Alembic.
revision: str = "552ac8c1defd"
down_revision: Union[str, None] = "0f8bbbcdd7be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

sql_files = [
    "export_zone_assignments_geo.sql",
    "get_block_assignments.sql",
    "get_block_assignments_geo.sql",
]


def upgrade() -> None:
    for file in sql_files:
        with open(settings.SQL_DIR / file) as f:
            stmt = f.read()
        op.execute(sa.text(stmt))


def downgrade() -> None:
    op.execute(sa.text("DROP FUNCTION IF EXISTS get_zone_assignments_geo(UUID)"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS get_block_assignments(UUID)"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS get_block_assignments_geo(UUID)"))
