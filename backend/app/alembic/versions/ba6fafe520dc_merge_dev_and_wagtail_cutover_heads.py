"""merge dev and wagtail-cutover heads

Revision ID: ba6fafe520dc
Revises: a1c4d2e9b7f3, a30db9686b7c
Create Date: 2026-08-04 19:06:23.398536

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "ba6fafe520dc"
# Merges the wagtail-cutover chain with dev's CURRENT head 2ecf1bdc582b
# (drop dead shatter/block-assignment tables), which descends from
# a30db9686b7c — merging the newer dev head covers the older one and keeps
# every stacked PR single-headed for `alembic upgrade head` in CI.
down_revision: Union[str, None] = ("a1c4d2e9b7f3", "2ecf1bdc582b")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
