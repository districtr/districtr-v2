"""empty message

Revision ID: 74a2006fbe2d
Revises: 6d83465440a6, a5ea471ee42b
Create Date: 2025-03-14 15:14:39.144046

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '74a2006fbe2d'
down_revision: Union[str, None] = ('6d83465440a6', 'a5ea471ee42b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
