"""Merge multiple heads

Revision ID: 39b5120b40a6
Revises: 2dbfabc0a613, dcce5c519ecc
Create Date: 2025-02-08 09:48:05.053694

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '39b5120b40a6'
down_revision: Union[str, None] = ('2dbfabc0a613', 'dcce5c519ecc')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
