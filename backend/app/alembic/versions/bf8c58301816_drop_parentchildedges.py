"""drop parentchildedges

Nothing reads this table: since the PR #721 graph work (baked in
production as of release 2.3.7), parent/child relationships are served
from the mmap-cached DualLevelGraph, and the shatter/unshatter UDFs that
joined this table were dropped in 2ecf1bdc582b. The table was write-only
— populated at map onboarding, kept in sync, never queried.

Dropping the LIST-partitioned parent table drops its per-map partitions
with it (~29 in production at time of writing; row counts are child-unit
edge counts per map, low millions total). DROP TABLE takes ACCESS
EXCLUSIVE on the parent and every partition, but with zero readers and
writers only at onboarding time, there is nothing to conflict with.

Revision ID: bf8c58301816
Revises: 2ecf1bdc582b
Create Date: 2026-09-22 21:19:58.486551

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.models

# revision identifiers, used by Alembic.
revision: str = "bf8c58301816"
down_revision: Union[str, None] = "2ecf1bdc582b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dropping the partitioned parent drops all attached per-map partitions.
    op.drop_table("parentchildedges")


def downgrade() -> None:
    """Recreate the empty partitioned parent as it existed at head.

    Restores schema only: per-map partitions and their rows are NOT
    restored, and the code that populated them (create_parent_child_edges)
    is deleted at this revision — a downgraded database has the table
    structure but no way to refill it.
    """
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
            ["districtr_map"], ["districtrmap.uuid"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("districtr_map", "parent_path", "child_path"),
        sa.UniqueConstraint(
            "districtr_map",
            "parent_path",
            "child_path",
            name="districtr_map_parent_child_edge_unique",
        ),
        postgresql_partition_by="LIST (districtr_map)",
    )
    op.create_index(
        "idx_parentchildedges_child_path_districtr_map",
        "parentchildedges",
        ["child_path", "districtr_map"],
    )
