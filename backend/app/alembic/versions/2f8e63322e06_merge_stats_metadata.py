"""merges update_stats and metadata revisions

Revision ID: 2f8e63322e06
Revises: 25416f500a9b, d38d0f766dc5
Create Date: 2025-05-02 08:12:07.908662

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2f8e63322e06"
down_revision: Union[str, None] = ("25416f500a9b", "d38d0f766dc5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
