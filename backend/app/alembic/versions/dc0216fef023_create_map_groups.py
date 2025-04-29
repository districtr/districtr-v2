"""create map groups

Revision ID: dc0216fef023
Revises: d38d0f766dc5
Create Date: 2025-04-29 15:50:59.583224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'dc0216fef023'
down_revision: Union[str, None] = 'd38d0f766dc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('map_group',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), unique=True, nullable=False),
        sa.Column('slug', sa.String(), unique=True, nullable=False),
    )
    op.create_table('districtrmaps_to_groups',
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('districtrmap_uuid', sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("group_id", "districtrmap_uuid", name="group_map_unique"),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["map_group.id"],
        ),
        sa.ForeignKeyConstraint(
            ["districtrmap_uuid"],
            ["districtrmap.uuid"],
        ),
    )
    op.execute(sa.text("INSERT INTO map_group (name, slug) VALUES ('States', 'states')"))
    op.execute(sa.text("INSERT INTO districtrmaps_to_groups (group_id, districtrmap_uuid) SELECT 1, uuid from districtrmap"))

def downgrade() -> None:
    op.drop_table('districtrmaps_to_groups')
    op.drop_table('map_group')
