"""add link btw DistrictMap and Place

Revision ID: fcf5c9dadb6d
Revises: 091eb9a26a92
Create Date: 2024-11-09 15:29:55.876410

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "fcf5c9dadb6d"
down_revision: Union[str, None] = "091eb9a26a92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column(
        "districtrmap",
        sa.Column(
            "districtr_place_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("districtrmap", "districtr_place_id")
    # ### end Alembic commands ###
