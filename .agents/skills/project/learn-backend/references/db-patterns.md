# DB Patterns

Detail behind `learn-backend`'s SQLAlchemy-first invariant: the UDF exception, legacy UDF
handling, migrations, and the `ParentChildEdges` partition/departition history. Read this
when touching Alembic migrations, `ParentChildEdges`, or any file in `backend/app/sql/`.

## Contents

- [Database](#database)
- [UDF Use Exception](#udf-use-exception)
- [Legacy UDF Handling](#legacy-udf-handling)
- [Migrations](#migrations)
- [ParentChildEdges and the departitioning story](#parentchildedges-and-the-departitioning-story)

## Database

PostgreSQL 15 with PostGIS 3.3 (`postgis/postgis:15-3.3-alpine` in `docker-compose.yml`).
Spatial types and functions are available directly in SQLAlchemy/SQLModel query composition.

## UDF Use Exception

A new UDF or stored procedure is warranted only when a measured performance or
operational requirement shows that SQLAlchemy plus set-based SQL cannot satisfy it
cleanly — "cleanly" meaning without falling back to row-by-row Python iteration. The
justification has to be written down (PR description, code comment, or both) because a
UDF's cost is paid later: it moves logic out of the application's type system and test
harness into a place `pytest` and `mypy` can't see, and every future reader has to go
find the function body in `backend/app/sql/` to know what an endpoint actually does.

## Legacy UDF Handling

`backend/app/sql/` holds UDFs from before the SQLAlchemy-first policy took hold —
`shatter_parent.sql`, `unshatter_parent.sql`, the `*_udf*.sql` summary-stat and
bbox functions. These remain supported (some, like `shatter_parent`, are still the live
write path for interactive shattering — see `learn-backend`'s shattered-parent contract)
but the set does not grow. When a change touches a UDF-backed flow, prefer replacing the
touched portion with SQLAlchemy query composition or a migration-safe inline SQL block
over extending the UDF.

## Migrations

No schema change ships without Alembic migration coverage (`backend/app/alembic/versions/`).
Keep upgrade and downgrade deterministic — a migration whose downgrade silently does
nothing (or raises) is only acceptable when the forward change is genuinely irreversible,
and that has to be stated in the migration's own docstring, not just discovered later. PR
#625 (below) is the worked example of documenting that tradeoff.

## ParentChildEdges and the departitioning story

`ParentChildEdges` is the one table in this schema still declared as a partitioned table
today (`postgresql_partition_by: "LIST (districtr_map)"`, `backend/app/models.py`) — as of
2026-08-27. Two other tables, `document.assignments` and `document.community_assignments`,
used to be partitioned the same way and no longer are. The two departitioning events below
are why any change to partition-adjacent code should check current `models.py` rather than
assume the old shape.

**`document.assignments` / `document.community_assignments` — departitioned, PR #625
(merged 2026-07-16).** Each of these had been LIST-partitioned per document: every
`create_document` call ran `CREATE TABLE ... PARTITION OF document.assignments`, which
takes an ACCESS EXCLUSIVE lock on the *parent* table. Under stress-test load (12,750
simulated users) this produced a lock convoy — every document creation or reset briefly
blocked all assignment reads and writes globally, and connections piled up until the ALB's
120s timeout was hit on ~93% of requests, confirmed via RDS Performance Insights showing
lock waits concentrated on `get_assignments`. Migration `7e57b49573e0` converted both
tables to plain tables (copy → drop old partitioned parents CASCADE → rename → rebuild
composite PKs → `ANALYZE`); reads and writes now take row locks only, and document
creation does no DDL at all. The migration is irreversible (downgrade raises; rollback is
a DB snapshot) — an explicit, documented tradeoff rather than an oversight. A HASH-
partitioning alternative was measured and rejected in the same PR: the composite-PK lookup
was ~4ms of a ~115ms `get_assignments` query, with the rest spent in the `parentchildedges`
join — partitioning the cheap part bought nothing.

**`ParentChildEdges` itself — a drop was attempted and reverted.** On 2026-07-17,
alongside the graph-representation work that became PR #721, a commit
("Drop parentchildedges table, partitions, and dependent UDFs") removed the
`ParentChildEdges` model, its population logic, both CLI edge commands, and the dead
`shatter_parent` / `unshatter_parent` / `get_block_assignments` UDFs, on the premise that
the in-memory graph could serve as the single source of parent-child truth instead of a
DB-side spatial join. It was reverted on 2026-08-06, before reaching `dev` — the graph
subsystem it depended on (mmap-shareable, single-source-of-truth graph reads) hadn't yet
landed. PR #721 ("Replace pickled networkx district graphs with a compact, mmap-shareable
graph class," open as of 2026-08-27; see `learn-performance`) is the prerequisite: it
migrates every runtime reader off `ParentChildEdges` onto the graph, but explicitly defers
actually dropping the table to a follow-up ("PR 2" in its own description), since the
table drop is a one-way schema change that the PR's author wants to bake in production
first. Until that follow-up lands, `ParentChildEdges` stays partitioned and live —
partition-routing semantics (LIST by `districtr_map`) still apply to any code that reads
or writes it directly, and `shatter_parent.sql` still depends on it existing.

## Common Failure Modes

- Broken downgrades from migration-only forward assumptions — verify both directions
  unless the migration is deliberately, documentedly irreversible.
- Query regressions from replacing set-based SQL with Python-side loops (the thing the
  SQLAlchemy-first policy exists to prevent).
- Assuming `document.assignments` or `document.community_assignments` are still
  partitioned — they are not, as of PR #625. Only `ParentChildEdges` is.
- Raw SQL safety bugs from string interpolation of values instead of bind parameters.
