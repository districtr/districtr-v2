"""add component_populations to county_demographics

Revision ID: f1a2c3d4e5b6
Revises: a30db9686b7c
Create Date: 2026-07-24 19:40:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

# revision identifiers, used by Alembic.
revision: str = "f1a2c3d4e5b6"
down_revision: Union[str, None] = "a30db9686b7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "county_demographics",
        sa.Column("component_populations", ARRAY(sa.Integer()), nullable=True),
        schema="evaluation",
    )


def downgrade() -> None:
    op.drop_column("county_demographics", "component_populations", schema="evaluation")
