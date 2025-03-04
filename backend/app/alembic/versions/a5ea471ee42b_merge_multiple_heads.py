"""Merge multiple heads

Revision ID: a5ea471ee42b
Revises: f36266d50cf7, 377c9e19cdfc
Create Date: 2025-02-14 08:15:23.059501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5ea471ee42b'
down_revision: Union[str, None] = ('f36266d50cf7', '377c9e19cdfc')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
