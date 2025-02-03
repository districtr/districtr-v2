"""Add color_scheme column

Revision ID: 24ba32e7c978
Revises: 0f8bbbcdd7be
Create Date: 2025-01-30 15:07:17.656208

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '24ba32e7c978'
down_revision: Union[str, None] = '0f8bbbcdd7be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('document.document', sa.Column('color_scheme', sa.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column('document.document', 'color_scheme')
