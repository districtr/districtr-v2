"""empty message

Revision ID: 0d38611a7556
Revises: 09d011c1b387, 5d9f7335f98a
Create Date: 2024-09-11 14:03:59.447749

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0d38611a7556"
down_revision: Union[str, None] = ("09d011c1b387", "5d9f7335f98a")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
