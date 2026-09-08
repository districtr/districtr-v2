# 17. SQLAlchemy-first / no-new-UDFs policy

Date: 2025-03-08 (recorded retrospectively 2026-09-08; codified 2026-04-21)

## Status

Accepted

## Context

Earlier backend work (from PR #283 onward) relied on Postgres UDFs for some query and geometry logic. Enforcement against writing new UDFs began informally at that point and continued through later performance work (PR #550), which replaced UDF-backed logic such as `get_unassigned_bboxes` with in-process computation. The policy was written down formally in PR #505's expert-guide sweep, which added explicit SQLAlchemy-first guidance, a no-new-UDF default, exception criteria, and legacy-UDF handling/migration direction to the repo's agentic-engineering documentation.

## Decision

Prefer SQLAlchemy query construction over new Postgres UDFs by default. Existing UDFs are quarantined as legacy — replaced opportunistically (as in PR #550's rewrite of the unassigned-bboxes path) rather than extended, and new UDFs require an explicit exception.

## Consequences

Query logic lives in versioned Python alongside the rest of the backend rather than in migration-managed SQL functions, which is easier to test, review, and refactor. Legacy UDFs that predate this policy remain in place until their call sites are migrated off them individually.
