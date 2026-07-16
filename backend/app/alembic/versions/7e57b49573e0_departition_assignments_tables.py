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
- Phase 2 (autocommit): drop the orphaned partitions in batches of 500
  (~2k lock slots per transaction), then the old parents. Safe to re-run: a
  failure here leaves the migration unstamped, and phase 1 skips tables that
  are already plain.

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
_DROP_BATCH = 500

_TABLES = (
    (
        "assignments",
        "document_id UUID NOT NULL, geo_id VARCHAR NOT NULL, zone INTEGER",
        "document_id, geo_id, zone",
        "assignments_pkey PRIMARY KEY (document_id, geo_id)",
    ),
    (
        "community_assignments",
        "document_id UUID NOT NULL, community_id SMALLINT NOT NULL, geo_id VARCHAR NOT NULL",
        "document_id, community_id, geo_id",
        "community_assignments_pkey PRIMARY KEY (document_id, community_id, geo_id)",
    ),
)


def upgrade() -> None:
    conn = op.get_bind()

    # ---- Phase 1: atomic swap. The ACCESS EXCLUSIVE lock held to the end of
    # the transaction means no write can slip between the copy and the rename.
    for table, columns, column_list, pk in _TABLES:
        is_partitioned = conn.execute(
            sa.text(
                "SELECT c.relkind = 'p' FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'document' AND c.relname = :t"
            ),
            {"t": table},
        ).scalar()
        if not is_partitioned:
            continue  # re-run after a phase-2 failure: this table already swapped

        op.execute(f"LOCK TABLE document.{table} IN ACCESS EXCLUSIVE MODE")
        op.execute(f"ALTER TABLE document.{table} RENAME TO {table}{_OLD_SUFFIX}")
        op.execute(f"CREATE TABLE document.{table} ({columns})")
        op.execute(
            f"INSERT INTO document.{table} ({column_list}) "
            f"SELECT {column_list} FROM document.{table}{_OLD_SUFFIX}"
        )
        # PK added after the bulk load: one fast index build instead of
        # incremental maintenance. Old PKs were named document_geo_id_unique /
        # document_community_geo_id_unique.
        op.execute(f"ALTER TABLE document.{table} ADD CONSTRAINT {pk}")
    # Intentionally not recreated:
    #  - ix_document_community_assignments_community_id / _geo_id: every query
    #    filters on document_id first, so the PK prefix covers them; dropping
    #    them removes index write amplification on the full-rewrite save path.

    # Legacy DB UDFs that emit CREATE TABLE ... PARTITION OF — unused by app
    # code and broken against plain tables. Their .sql source files stay on
    # disk: b7adbf498feb / fa7d5c356d1f read them at upgrade time on fresh DBs.
    op.execute("DROP FUNCTION IF EXISTS create_document(TEXT)")
    op.execute("DROP FUNCTION IF EXISTS create_assignment_partition_sql(TEXT)")

    # ---- Phase 2: drop the orphaned partitions in lock-bounded batches.
    with op.get_context().autocommit_block():
        for table, *_ in _TABLES:
            old = f"document.{table}{_OLD_SUFFIX}"
            while True:
                names = (
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
                if not names:
                    break
                conn.execute(sa.text("DROP TABLE " + ", ".join(names)))
            op.execute(f'DROP TABLE IF EXISTS {old}')
            # Fresh tables have no planner stats until autoanalyze runs.
            op.execute(f"ANALYZE document.{table}")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: restoring per-document LIST partitioning would require "
        "one CREATE TABLE ... PARTITION OF per existing document, recreating "
        "the design this migration removes. Roll back via DB snapshot."
    )
