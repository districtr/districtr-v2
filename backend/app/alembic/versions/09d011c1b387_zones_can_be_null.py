"""zones_can_be_null

Revision ID: 09d011c1b387
Revises: 8437ce954087
Create Date: 2024-09-09 13:34:59.347083

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '09d011c1b387'
down_revision: Union[str, None] = '8437ce954087'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE document.assignments ALTER zone DROP NOT NULL"))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM document.assignments WHERE zone IS NULL"))
    op.execute(sa.text("ALTER TABLE document.assignments ALTER zone SET NOT NULL"))
