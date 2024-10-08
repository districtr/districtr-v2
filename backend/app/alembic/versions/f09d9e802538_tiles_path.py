"""tiles path

Revision ID: f09d9e802538
Revises: 2e490fecfe0b
Create Date: 2024-08-08 09:15:02.885365

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision: str = "f09d9e802538"
down_revision: Union[str, None] = "2e490fecfe0b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column(
        "gerrydbtable",
        sa.Column("tiles_s3_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("gerrydbtable", "tiles_s3_path")
    # ### end Alembic commands ###
