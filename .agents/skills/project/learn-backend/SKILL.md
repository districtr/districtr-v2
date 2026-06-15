---
name: learn-backend
description: FastAPI + SQLModel conventions, request dependencies, transaction safety, and backend architecture
user-invocable: false
---

# Backend

Backend conventions for FastAPI + SQLModel/SQLAlchemy services, request dependencies, transaction safety, and SQLAlchemy-first implementation style.

## When To Use
- You are adding or changing API endpoints in `backend/app`.
- You are modifying models, dependencies, auth, or DB-access code.
- You are changing data-manipulation logic, especially assignment/map workflows.

## Canonical Files
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/core/db.py`
- `backend/app/core/config.py`
- `backend/app/core/dependencies.py`
- `backend/app/core/security.py`
- `backend/app/core/io.py`
- `backend/app/core/models.py`
- `backend/app/utils.py`
- `backend/app/assignments/assignments.py`
- `backend/app/comments/*`
- `backend/app/cms/*`
- `backend/app/save_share/*`
- `backend/app/exports/*`
- `backend/app/sql/*` - legacy UDF SQL files (do not expand; see [learn-db-query](../learn-db-query/SKILL.md))

## Hard Invariants
- **SQLAlchemy-First**: new backend logic defaults to SQLAlchemy/SQLModel query composition and set-based SQL. See [learn-db-query](../learn-db-query/SKILL.md) for full DB query policy.
- Use dependency helpers consistently (`get_document`, `get_protected_document`, `parse_document_id`).
- Preserve public/private document ID semantics and access guarantees.
- Keep write paths transaction-safe; commit only after full operation success.
- Keep API behavior aligned with frontend contracts in `app/src/app/utils/api/apiHandlers/types.ts`.
- Avoid in-memory Python processing for large spatial/tabular operations when DB can perform set-based operations.

## Preferred Patterns
- Use SQLAlchemy text/bindparams safely when dynamic SQL is unavoidable.
- Keep endpoint handlers thin when shared logic already exists in modules (`assignments`, `utils`, etc.).
- Add/adjust tests under `backend/tests` for endpoint or DB behavior changes.

## Anti-Patterns
- Bypassing existing dependency guards and leaking private IDs.
- Mixing unrelated concerns inside one endpoint without reusable helper boundaries.

## Change Checklist
1. Confirm endpoint auth/dependency behavior for public vs protected access.
2. Confirm DB writes are atomic and rollback-safe.
3. Verify response schema alignment with frontend types.
4. Confirm tests cover changed logic and edge/error paths.
5. If touching legacy UDF paths, follow [learn-db-query](../learn-db-query/SKILL.md).

## Validation Commands
- `cd backend && pytest -v`
- `docker-compose exec backend pytest -v`
- `docker-compose up pre-commit`

## See Also
- [learn-db-query](../learn-db-query/SKILL.md) - SQLAlchemy-first DB patterns, migrations, UDF policy
- [learn-auth-share](../learn-auth-share/SKILL.md) - Authentication and security
- [learn-docker](../learn-docker/SKILL.md) - Container and development setup

## Common Failure Modes
- Access-control regressions from using `get_document` where `get_protected_document` was intended.
- Partial writes caused by commit timing mistakes in multi-step operations.
- API schema drift that breaks frontend parsing.

