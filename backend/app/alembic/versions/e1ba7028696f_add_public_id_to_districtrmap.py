"""Add public_id to DistrictrMap

Revision ID: e1ba7028696f
Revises: 545e708aeb30
Create Date: 2025-07-07 13:36:26.214887

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1ba7028696f"
down_revision: Union[str, None] = "545e708aeb30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("districtrmap", sa.Column("public_id", sa.Integer(), nullable=True))
    op.create_index(
        "idx_districtrmap_public_id", "districtrmap", ["public_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("idx_districtrmap_public_id", table_name="districtrmap")
    op.drop_column("districtrmap", "public_id")
