# 46. Assignments tables departitioned

Date: 2026-07-16 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Stress testing against beta showed roughly 93% request failure at 12,750 simulated users with both app and database CPU idle. `create_document` ran `CREATE TABLE ... PARTITION OF document.assignments` per document — a DDL statement that takes an `ACCESS EXCLUSIVE` lock on the parent table — so every document creation, and every reset (which did `DROP`+`CREATE`), globally blocked all assignment reads and writes. Under load this became a lock convoy: connections piled up on the parent-table lock, pools exhausted, and everything hit the ALB's 120s timeout. This was confirmed via RDS Performance Insights (lock waits concentrated on `get_assignments`) and a viewers-only run where removing writes dropped failures from ~92% to ~34% (PR #625, migration `7e57b49573e0`).

## Decision

Convert `document.assignments` and `document.community_assignments` from per-document `LIST` partitions to plain tables. Document creation and reset now do row-level operations only (`DELETE` for reset), taking no DDL lock. The migration copies data, drops the old partitioned parents `CASCADE`, renames the new tables in, rebuilds composite primary keys post-load, and runs `ANALYZE`. It is deliberately irreversible — the downgrade raises, and rollback is a database snapshot.

## Alternatives considered

- Fixed `HASH` partitioning instead of per-document `LIST` partitioning. Measured and rejected — the composite-PK lookup accounts for only about 4ms of a roughly 115ms `get_assignments` query (the rest is the `parentchildedges` join), so partitioning the cheap part buys nothing.

## Consequences

Assignment reads and writes take row locks only; document creation and reset no longer contend with all other assignment traffic. The two `community_assignments` secondary indexes were deliberately not recreated — every query filters `document_id` first, so the primary-key prefix covers them, and the save path sheds index write amplification. The migration's irreversibility means any rollback after deploy requires restoring from a database snapshot, not an `alembic downgrade`.
