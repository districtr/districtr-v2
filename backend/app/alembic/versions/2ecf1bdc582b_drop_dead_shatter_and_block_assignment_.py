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

# All seven confirmed dead: zero call sites anywhere in app/, cli.py, or
# pipelines/ (only the migrations that created them). The live shatter/
# unshatter path goes through the generic PUT /api/assignments endpoint,
# with children resolved via the graph-backed GET /api/gerrydb/edges
# (get_children) instead. get_block_assignments and its overloads/variants
# predate even that -- some still reference the per-map "parentchildedges_%s"
# partition-table naming this PR's own body says was already removed.
#
# Postgres overloads by argument signature, so get_block_assignments(UUID)
# and get_block_assignments(UUID, INTEGER[]) are two distinct functions --
# both dead, dropped separately below. The 2-arg overload and its "_geo"/
# "_bboxes" siblings are defined in files whose names don't match the
# function they create (get_block_zone_assignments.sql actually creates
# get_block_assignments, not get_block_zone_assignments) -- filename is
# tracked alongside each entry here so downgrade() doesn't have to guess it.
UDFS_TO_DROP = [
    ("shatter_parent", "UUID, VARCHAR[]", "shatter_parent.sql"),
    ("unshatter_parent", "UUID, VARCHAR[], INTEGER", "unshatter_parent.sql"),
    ("get_block_assignments", "UUID", "get_block_assignments.sql"),
    ("get_block_assignments_geo", "UUID", "get_block_assignments_geo.sql"),
    (
        "get_block_assignments",
        "UUID, INTEGER[]",
        "get_block_zone_assignments.sql",
    ),
    (
        "get_block_assignments_geo",
        "UUID, INTEGER[]",
        "get_block_zone_assignments_geo.sql",
    ),
    (
        "get_block_assignments_bboxes",
        "UUID, INTEGER[]",
        "get_block_zone_assignments_bboxes.sql",
    ),
]


def upgrade() -> None:
    for name, arg_types, _ in UDFS_TO_DROP:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {name}({arg_types})"))


def downgrade() -> None:
    # The live .sql files stay in app/sql/ (earlier migrations still read
    # them directly on a full replay), so recreate straight from there.
    for _, _, filename in UDFS_TO_DROP:
        with open(settings.SQL_DIR / filename, "r") as f:
            sql = f.read()
        op.execute(sa.text(sql))
