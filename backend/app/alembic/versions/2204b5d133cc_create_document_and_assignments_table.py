"""create document and assignments table

Revision ID: 2204b5d133cc
Revises: 966d8d72887e
Create Date: 2024-07-21 12:32:59.181984

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2204b5d133cc"
down_revision: Union[str, None] = "966d8d72887e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))


def downgrade() -> None:
    pass
