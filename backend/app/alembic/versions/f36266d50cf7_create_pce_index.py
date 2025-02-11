"""create_pce_index

Revision ID: f36266d50cf7
Revises: 3bd06553411c
Create Date: 2025-02-11 18:29:25.532048

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f36266d50cf7'
down_revision: Union[str, None] = '3bd06553411c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if the index already exists before creating it
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT to_regclass('public.idx_parentchildedges_child_path_districtr_map')"
        )
    )
    if result.scalar() is None:
        op.create_index(
            'idx_parentchildedges_child_path_districtr_map',
            'parentchildedges',
            ['child_path', 'districtr_map'],
        )
    pass


def downgrade() -> None:
    op.drop_index('idx_parentchildedges_child_path_districtr_map', table_name='parentchildedges')
    pass
