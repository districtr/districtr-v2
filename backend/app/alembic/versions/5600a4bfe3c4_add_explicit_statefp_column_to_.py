"""Add explicit statefp column to districtrmap

Revision ID: 5600a4bfe3c4
Revises: 0db008690d60
Create Date: 2026-01-26 18:38:15.010498

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5600a4bfe3c4'
down_revision: Union[str, None] = '0db008690d60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('districtrmap', sa.Column('statefps', sa.ARRAY(sa.String()), nullable=True))
    pass


def downgrade() -> None:
    op.drop_column('districtrmap', 'statefps')
    pass
