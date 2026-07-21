---
name: learn-db-query
description: SQLAlchemy-first DB patterns, Alembic migrations, ParentChildEdges partition handling, and UDF policy
user-invocable: false
---

# DB Query & Migrations

Database implementation standards for SQLAlchemy-first query design, migration safety, and controlled migration away from legacy UDFs.

## When To Use
- You are changing DB query logic in backend code.
- You are writing/changing Alembic migrations.
- You are touching `ParentChildEdges` (the only remaining partitioned table), spatial joins, or legacy SQL/UDF files.

## Canonical Files
- `backend/app/core/db.py`
- `backend/app/utils.py`
- `backend/app/assignments/assignments.py`
- `backend/app/alembic/env.py`
- `backend/app/alembic/versions/*`
- `backend/app/sql/*`
- `backend/app/models.py`

## Hard Invariants
- Database is **PostgreSQL 15 with PostGIS 3.3**. Spatial types and functions are available.
- **SQLAlchemy-First**: prefer SQLAlchemy/SQLModel query composition and parameterized set-based SQL.
- No schema change ships without Alembic migration coverage.
- `document.assignments` and `document.community_assignments` are **plain tables** (departitioned). Only `ParentChildEdges` remains LIST-partitioned (on `districtr_map`); partition-routing semantics apply there only.
- Bind parameters are required for values; identifier interpolation is restricted and justified.
- Keep migration behavior deterministic in both upgrade and downgrade paths.

## Preferred Patterns
- Use transaction-safe bulk operations (`insert ... from select`, temp-table workflows) when needed.
- Use Alembic revisions for schema evolution and data backfills.
- Keep SQL in migrations/queries readable and testable.

## Anti-Patterns
- Creating new UDFs or stored procedures for routine business logic (see UDF Use Exception below).
- Coupling app behavior to opaque DB function internals without tests.

## UDF Use Exception
A new UDF/stored procedure is allowed only when you can document a measured performance/operational requirement that SQLAlchemy + set-based SQL cannot satisfy cleanly.

## Legacy UDF Handling
Legacy UDFs remain supported but should not expand. When touching UDF-backed flows, prefer incremental replacement with SQLAlchemy query composition or migration-safe inline SQL blocks.

## Change Checklist
1. Confirm query can be expressed with SQLAlchemy + set-based SQL first.
2. If raw SQL is needed, confirm bindparam usage and SQL injection safety.
3. Add/adjust migration and downgrade for schema-impacting changes.
4. Validate partition behavior for `ParentChildEdges` where relevant (assignments are unpartitioned plain tables).
5. Add or update backend tests covering query correctness and edge cases.

## Validation Commands
- `cd backend && alembic upgrade head`
- `cd backend && pytest -v`

## Common Failure Modes
- Broken downgrades from migration-only forward assumptions.
- Query regressions from replacing set-based SQL with Python-side loops.
- Partition mismatches on `ParentChildEdges` causing inserts to fail or route incorrectly (assignments no longer partitioned).
- Raw SQL safety bugs from string interpolation of values.
- Concurrent cache rebuilds into `district_unions` without `ON CONFLICT DO NOTHING` → unique-violation 500s.
