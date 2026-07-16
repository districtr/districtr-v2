"""departition assignments tables

Replace per-document LIST partitioning of document.assignments and
document.community_assignments with plain tables. CREATE TABLE ... PARTITION OF
takes an ACCESS EXCLUSIVE lock on the parent, so every document creation (and
the reset endpoint's DROP+CREATE) globally blocked all assignment reads and
writes — the lock convoy behind the July 2026 stress-test collapses (~93%
failure with app and DB CPU idle; RDS lock waits concentrated on
get_assignments). Plain tables take row locks only.

Alternatives measured against the resulting big table (260k rows dev / EXPLAIN
ANALYZE on the largest document, 38k rows): the composite-PK lookup resolves a
document in ~4ms of a ~115ms get_assignments query — the rest is the
parentchildedges LEFT JOIN — so fixed HASH partitioning was rejected (it would
shave microseconds off the cheap part while reintroducing partition machinery).
A nested-loop join via the existing (child_path, districtr_map) index was also
tested: 140ms, worse than the planner's hash join. If get_assignments ever
needs to be faster, denormalize parent_path onto assignments; don't partition.

Runs in two phases because a single-transaction DROP CASCADE of N partitions
needs ~3-4 lock slots per partition and exhausted the lock table
(max_locks_per_transaction × max_connections) on databases with thousands of
stress-test partitions:
- Phase 1 (one transaction, atomic): rename the partitioned parents out of the
  way, create plain tables, copy data, build PKs. Lock cost is ~1 AccessShare
  per partition (the copy scan) — the part that fit even where the drop failed.
- Phase 2 (autocommit): drop the orphaned partitions in batches, then the old
  parents. Safe to re-run: a failure here leaves the migration unstamped, and
  phase 1 skips tables that are already plain.

Revision ID: 7e57b49573e0
Revises: 3e2c40e7d148
Create Date: 2026-07-16 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7e57b49573e0"
down_revision: Union[str, None] = "3e2c40e7d148"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_SUFFIX = "_old_departition"
# Each dropped partition costs ~3-4 lock-table slots; 500/batch stays well
# under max_locks_per_transaction × max_connections even on small instances.
_DROP_BATCH = 500

# The old ix_document_community_assignments_community_id / _geo_id indexes are
# intentionally not recreated: every query filters on document_id first, so
# the PK prefix covers them.
_TABLES = [
    {
        "table": "assignments",
        "columns": "document_id UUID NOT NULL, geo_id VARCHAR NOT NULL, zone INTEGER",
        "select_list": "document_id, geo_id, zone",
        "pk_columns": "document_id, geo_id",
    },
    {
        "table": "community_assignments",
        "columns": "document_id UUID NOT NULL, community_id SMALLINT NOT NULL, geo_id VARCHAR NOT NULL",
        "select_list": "document_id, community_id, geo_id",
        "pk_columns": "document_id, community_id, geo_id",
    },
]


def _is_partitioned(conn, table: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                "SELECT c.relkind = 'p' FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'document' AND c.relname = :t"
            ),
            {"t": table},
        ).scalar()
    )


def _swap_to_plain_table(table: str, columns: str, select_list: str, pk_columns: str):
    """Rename the partitioned parent aside and rebuild `table` as a plain
    table with the same rows.

    Runs inside the migration transaction: the ACCESS EXCLUSIVE lock taken by
    the RENAME is held until commit, so no write can slip between the copy and
    the swap.
    """
    old = f"{table}{_OLD_SUFFIX}"
    op.execute(f"ALTER TABLE document.{table} RENAME TO {old}")
    # RENAME TABLE doesn't rename indexes: free up the default PK name in case
    # the old parent's PK used it (varies by which migration built the DB).
    op.execute(f"ALTER INDEX IF EXISTS document.{table}_pkey RENAME TO {old}_pkey")
    op.execute(f"CREATE TABLE document.{table} ({columns})")
    op.execute(
        f"INSERT INTO document.{table} ({select_list}) "
        f"SELECT {select_list} FROM document.{old}"
    )
    # PK built after the bulk load: one fast index build instead of
    # incremental maintenance on every inserted row.
    op.execute(
        f"ALTER TABLE document.{table} "
        f"ADD CONSTRAINT {table}_pkey PRIMARY KEY ({pk_columns})"
    )


def _drop_old_partitions(conn, table: str):
    """Drop the renamed parent's partitions in lock-bounded batches, then the
    parent itself. Runs in autocommit, so each batch is its own transaction.
    No-op if a previous attempt already finished this table."""
    old = f"document.{table}{_OLD_SUFFIX}"
    while True:
        partitions = (
            conn.execute(
                sa.text(
                    "SELECT format('%I.%I', n.nspname, c.relname) "
                    "FROM pg_inherits i "
                    "JOIN pg_class c ON c.oid = i.inhrelid "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE i.inhparent = to_regclass(:parent) "
                    "LIMIT :batch"
                ),
                {"parent": old, "batch": _DROP_BATCH},
            )
            .scalars()
            .all()
        )
        if not partitions:
            break
        conn.execute(sa.text("DROP TABLE " + ", ".join(partitions)))
    op.execute(f"DROP TABLE IF EXISTS {old}")


def upgrade() -> None:
    conn = op.get_bind()

    # Phase 1 (single transaction): atomically swap each partitioned table for
    # a plain one. Skips tables a previous attempt already swapped.
    for spec in _TABLES:
        if _is_partitioned(conn, spec["table"]):
            _swap_to_plain_table(**spec)

    # Legacy DB UDFs that emit CREATE TABLE ... PARTITION OF — unused by app
    # code and broken against plain tables. Their .sql source files stay on
    # disk: b7adbf498feb / fa7d5c356d1f read them at upgrade time on fresh DBs.
    op.execute("DROP FUNCTION IF EXISTS create_document(TEXT)")
    op.execute("DROP FUNCTION IF EXISTS create_assignment_partition_sql(TEXT)")

    # Phase 2 (autocommit): drop the orphaned partitions in lock-bounded
    # batches, then refresh planner stats on the new tables.
    with op.get_context().autocommit_block():
        for spec in _TABLES:
            _drop_old_partitions(conn, spec["table"])
            op.execute(f"ANALYZE document.{spec['table']}")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: restoring per-document LIST partitioning would require "
        "one CREATE TABLE ... PARTITION OF per existing document, recreating "
        "the design this migration removes. Roll back via DB snapshot."
    )
