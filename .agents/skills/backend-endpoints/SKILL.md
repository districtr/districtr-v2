---
name: backend-endpoints
description: Adding or changing a backend route or endpoint, a SQLModel data model, a request dependency, or a database query in backend/app.
user-invocable: false
---

# Backend Endpoints & Data Model

## Constraints

- **Backend logic lives in Python, where tests, types, and review reach it.** New query
  logic composes as SQLAlchemy/SQLModel expressions and set-based SQL. The UDFs in
  `backend/app/sql/` are retained history, not precedent — some (like `shatter_parent`)
  are still live write paths, but the set does not grow. A new UDF or stored procedure
  is warranted only when a measured performance or operational requirement shows the
  SQLAlchemy path cannot satisfy it without row-by-row Python iteration, and the
  justification must be written down (PR description or code comment): a UDF's cost is
  paid later, by every reader who has to leave the application's type system and test
  harness to learn what an endpoint does.
- **Shattered-parent contract**: once a parent geography is shattered, every one of its
  children has a row in `document.assignments` — `zone = NULL` for a child that hasn't
  been painted. The frontend uses the presence of a child row (not its zone) to decide
  which block IDs are interactive; a missing row means the frontend can't tell the child
  exists. Two independent write paths uphold this and never reference each other:
  interactive shattering (`backend/app/sql/shatter_parent.sql`) and CSV import
  (`_heal_or_fill` in `backend/app/assignments/assignments.py`, invoked during
  `batch_insert_assignments` — an uploaded CSV may list only some of a shattered
  parent's children, and the unlisted siblings must still end up with rows). A change
  to one path without checking the other is how this contract silently breaks.
- **The document UUID is the edit capability — treat it as a secret** (see CLAUDE.md).
  At this surface: a response reachable by `public_id` must never contain the true
  `document_id`. `get_document` (`core/dependencies.py`) resolves private ids only
  (write paths); `get_protected_document` resolves either id and returns the raw
  `Document` row — read fields, compute, assemble the response by hand, and leave
  `document_id` out of it.

## Vocabulary at this surface

- **`parent_layer` / `child_layer` are roles relative to a map module, not units**:
  parent = the coarse paintable layer (a VTD layer in one module, a block-group layer
  in another), child = the fine shatter target. `parent_layer` is NOT NULL on every
  module — a non-shatterable module's only layer sits in `parent_layer` with no
  children; shatterable means `child_layer IS NOT NULL`.
- **`zone` holds a `community_id` on community maps** (`map_type: "community"`), with
  `0` as the unassigned sentinel there.

## Where the rest lives

- Data-model narrative (document/assignments split, module anatomy): `docs/overview.md`.
- Partition history (PR #625 departitioning, the `ParentChildEdges` drop-and-revert):
  `docs/decisions.md` — read before touching partition-adjacent code; check current
  `models.py` rather than assuming the old shape.
- Migration authoring: the `run-migration` runbook.
