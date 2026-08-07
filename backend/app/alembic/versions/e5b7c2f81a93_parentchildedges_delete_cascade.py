"""Cascade parentchildedges rows when their districtr map is deleted.

parentchildedges is LIST-partitioned by districtr_map (one partition per
shatterable map); its FK to districtrmap.uuid had no ON DELETE behavior, so
any map with a child layer could never be deleted — the next blocker after
c8f3a1d92e47 fixed the group-link FKs. Edges are derived data written at
import/compose time; cascade is correct. The now-empty partition stays
attached after a delete — cosmetic, and dropping it is a follow-up
optimization, not a correctness issue.

The document.document FK deliberately keeps NO ACTION: maps with saved
plans must not be deletable.

Revision ID: e5b7c2f81a93
Revises: c8f3a1d92e47
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e5b7c2f81a93"
down_revision: Union[str, None] = "c8f3a1d92e47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "parentchildedges_districtr_map_fkey", "parentchildedges", type_="foreignkey"
    )
    op.create_foreign_key(
        "parentchildedges_districtr_map_fkey",
        "parentchildedges",
        "districtrmap",
        ["districtr_map"],
        ["uuid"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "parentchildedges_districtr_map_fkey", "parentchildedges", type_="foreignkey"
    )
    op.create_foreign_key(
        "parentchildedges_districtr_map_fkey",
        "parentchildedges",
        "districtrmap",
        ["districtr_map"],
        ["uuid"],
    )
