"""Drop parentchildedges and its UDFs — the graph now serves parent-child data

Parent-child relationships are read from the pipeline-built graph files
(see app/evaluation/district_graph.py); the parentchildedges table, its
per-map partitions, and the UDFs that depended on it are unused.

Run `python cli.py verify-graph-edges` against the target database BEFORE
applying this migration to confirm graph data matches the table.

Downgrade recreates the empty partitioned table, its index, and the UDFs
(from the retained app/sql files) — per-map partitions and rows are NOT
restored; they would need to be rebuilt from the pre-deprecation code.

Revision ID: a1b2c3d4e5f6
Revises: 7e57b49573e0
Create Date: 2026-07-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.constants import SQL_DIR
import app.models

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "7e57b49573e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PCE_DEPENDENT_FUNCTIONS = [
    "shatter_parent(UUID, VARCHAR[])",
    "unshatter_parent(UUID, VARCHAR[], INTEGER)",
    # get_block_zone_assignments.sql defines the (UUID, INTEGER[]) OVERLOAD of
    # get_block_assignments — the name in the filename is historical.
    "get_block_assignments(UUID)",
    "get_block_assignments(UUID, INTEGER[])",
    "get_block_zone_assignments(UUID, INTEGER[])",
]

_PCE_FUNCTION_FILES = [
    "shatter_parent.sql",
    "unshatter_parent.sql",
    "get_block_assignments.sql",
    "get_block_zone_assignments.sql",
]


def upgrade() -> None:
    for signature in _PCE_DEPENDENT_FUNCTIONS:
        op.execute(f"DROP FUNCTION IF EXISTS {signature}")
    op.execute("DROP PROCEDURE IF EXISTS add_parent_child_relationships(TEXT)")
    # CASCADE drops all per-map partitions (parentchildedges_{uuid}).
    op.execute("DROP TABLE IF EXISTS parentchildedges CASCADE")


def downgrade() -> None:
    op.create_table(
        "parentchildedges",
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("districtr_map", app.models.UUIDType(), nullable=False),
        sa.Column("parent_path", sa.String(), nullable=False),
        sa.Column("child_path", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["districtr_map"],
            ["districtrmap.uuid"],
        ),
        sa.PrimaryKeyConstraint("districtr_map", "parent_path", "child_path"),
        postgresql_partition_by="LIST (districtr_map)",
    )
    op.create_index(
        "idx_parentchildedges_child_path_districtr_map",
        "parentchildedges",
        ["child_path", "districtr_map"],
    )
    for file_name in _PCE_FUNCTION_FILES:
        with open(SQL_DIR / file_name) as f:
            op.execute(f.read())
