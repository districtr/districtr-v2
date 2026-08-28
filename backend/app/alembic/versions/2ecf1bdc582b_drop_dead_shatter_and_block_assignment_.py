"""drop dead shatter and block assignment udfs

Revision ID: 2ecf1bdc582b
Revises: a30db9686b7c
Create Date: 2026-08-28 19:15:23.392670

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.core.config import settings


# revision identifiers, used by Alembic.
revision: str = "2ecf1bdc582b"
down_revision: Union[str, None] = "a30db9686b7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All four confirmed dead: zero call sites anywhere in app/, cli.py, or
# pipelines/ (only the migrations that created them). The live shatter/
# unshatter path goes through the generic PUT /api/assignments endpoint,
# with children resolved via the graph-backed GET /api/gerrydb/edges
# (get_children) instead. get_block_assignments(_geo) predate even that --
# they still reference the per-map "parentchildedges_%s" partition-table
# naming this PR's own body says was already removed.
UDFS_TO_DROP = [
    ("shatter_parent", "UUID, VARCHAR[]"),
    ("unshatter_parent", "UUID, VARCHAR[], INTEGER"),
    ("get_block_assignments", "UUID"),
    ("get_block_assignments_geo", "UUID"),
]


def upgrade() -> None:
    for name, arg_types in UDFS_TO_DROP:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {name}({arg_types})"))


def downgrade() -> None:
    # The live .sql files stay in app/sql/ (earlier migrations still read
    # them directly on a full replay), so recreate straight from there.
    for name, _ in UDFS_TO_DROP:
        with open(settings.SQL_DIR / f"{name}.sql", "r") as f:
            sql = f.read()
        op.execute(sa.text(sql))
