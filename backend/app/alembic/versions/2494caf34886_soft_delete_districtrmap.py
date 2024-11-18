"""soft delete districtrmap

Revision ID: 2494caf34886
Revises: 65a4fc0a727d
Create Date: 2024-11-18 09:37:23.352006

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2494caf34886"
down_revision: Union[str, None] = "65a4fc0a727d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "districtrmap",
        sa.Column("visible", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("districtrmap", "visible")
    # ### end Alembic commands ###
