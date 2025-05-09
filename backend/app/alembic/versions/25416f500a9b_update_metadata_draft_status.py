"""update metadata draft status

Revision ID: 25416f500a9b
Revises: ea4bc886a999
Create Date: 2025-04-26 17:27:04.406473

"""

from typing import Sequence, Union

from alembic import op
from pathlib import Path
from app.constants import SQL_DIR

# revision identifiers, used by Alembic.
revision: str = "25416f500a9b"
down_revision: Union[str, None] = "ea4bc886a999"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with Path(SQL_DIR, "update_metadata_draft_status.sql").open() as f:
        sql = f.read()
        op.execute(sql)
    pass


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS update_metadata_draft_status")
    pass
