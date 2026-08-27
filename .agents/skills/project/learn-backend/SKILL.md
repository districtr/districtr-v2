---
name: learn-backend
description: Server endpoints and the data model — FastAPI/SQLModel conventions, request dependencies, transaction safety, and how DB access is expected to be composed. Use when adding or changing API endpoints, models, dependencies, or data-manipulation logic in the backend service.
user-invocable: false
---

# Backend

## Invariants

- **SQLAlchemy/SQLModel-first**: new query logic here is expected to compose as
  SQLAlchemy/SQLModel expressions and set-based SQL. A new UDF or stored procedure is the
  exception, not a peer option, and needs a written performance justification — see
  [references/db-patterns.md](references/db-patterns.md) for the exception clause and the
  legacy UDFs it governs.
- **Shattered-parent contract**: once a parent geography is shattered, every one of its
  children has a row in `document.assignments` — `zone = NULL` for a child that hasn't
  been painted. The frontend uses the presence of a child row (not its zone) to decide
  which block IDs are interactive; a missing row means the frontend can't tell the child
  exists. Verified current against `backend/app/sql/shatter_parent.sql` and
  `_heal_or_fill` in `backend/app/assignments/assignments.py` (2026-08-27).
- **`get_document` vs `get_protected_document`**: the two dependencies differ only in
  which ID they accept, but that difference is the access boundary. `get_document`
  requires the true `document_id` (UUID) — only someone with edit access has it.
  `get_protected_document` also accepts the numeric `public_id`, so it resolves for
  anonymous viewers too. Returning `get_protected_document`'s result from a public
  endpoint would hand back the real `document_id`, defeating the public/private split —
  use it to *guard* an endpoint, not to answer it.

## The document/assignments split

A `Document` row (`backend/app/models.py`) carries plan metadata — slug, map type, zone
count, timestamps. Its assignments live in a separate table, `document.assignments`
(`geo_id`, `zone`, `document_id`), keyed by geography rather than by district. This
split exists because assignments are the hot path — painted one geography at a time,
diffed and conflict-checked on every save — while document metadata changes rarely.
Endpoints that touch both (e.g. `update_assignments` in `backend/app/main.py`) update
metadata's `updated_at` deliberately, since the frontend's optimistic-concurrency check
(`learn-state-sync`) keys off that single timestamp for the whole document.

`get_protected_document` and `get_document` are both request dependencies
(`backend/app/core/dependencies.py`), composed via FastAPI's `Depends()` — `parse_document_id`
sits upstream of both, turning the raw path parameter into a `DocumentID` value object
that already knows whether it's a public or private ID. Endpoint handlers stay thin: the
ID-resolution and access-boundary logic lives once in the dependency, not copied into
every handler that needs a document.

## Shattered Parent Assignment Data Contract

When a parent geography (a VTD, say) is shattered into its children (blocks), the
invariant above is upheld by two independent write paths that must agree:

- **Interactive shattering** — `shatter_parent.sql`, a UDF invoked when a user clicks to
  shatter a unit in the map UI. It inserts one row per child, inheriting the parent's
  current zone (so an unpainted parent produces `zone = NULL` children, and a painted
  parent produces children pre-filled with its zone), then deletes the parent's own row.
- **CSV import** — `_heal_or_fill` in `backend/app/assignments/assignments.py`, invoked
  during `batch_insert_assignments`. An uploaded CSV may cover only some of a shattered
  parent's children (e.g. the file only lists blocks the uploader painted). `_heal_or_fill`
  fills every unlisted sibling with `zone = None` so the contract holds even for partial
  uploads — a separate pass ("heal") also collapses children back into their parent when
  every child in the upload shares one zone, since a shattered unit with a uniform zone
  carries no more information than its parent would.

Both paths exist because interactive shattering and CSV import are different entry
points into the same invariant; a change to one without checking the other is how this
contract silently breaks.

## Transaction and write-path shape

Write endpoints commit only after the full operation succeeds — a document update that
touches assignments, `updated_at`, and (for community maps) comment counts does all of
it inside one transaction, so a mid-operation failure leaves nothing partially applied.
`update_assignments` (`backend/app/main.py`) is the fullest example: it compares the
client's `last_updated_at` against the current `Document.updated_at` before writing
(409 unless `overwrite=True` — the server half of the optimistic-concurrency contract
`learn-state-sync` documents from the client side), and only bumps `updated_at` when
something in the payload actually changed, since an unmoved bump would falsely tell
other clients the document diverged.

## Territory

- `backend/app/main.py` — endpoint definitions; `update_assignments` is the conflict/write
  reference implementation.
- `backend/app/models.py` — `Document`, `DistrictrMap`, `Assignments` and friends.
- `backend/app/core/dependencies.py` — `parse_document_id`, `get_document`,
  `get_protected_document`, `get_document_public`, `get_districtr_map`.
- `backend/app/core/db.py` — session/engine setup.
- `backend/app/core/security.py`, `core/config.py` — auth and settings; see
  `learn-auth-share` for the concern these files serve.
- `backend/app/assignments/assignments.py` — `_heal_or_fill`, `batch_insert_assignments`,
  community-assignment copy paths.
- `backend/app/comments/*`, `backend/app/cms/*` — see `learn-cms` for the concern.
- `backend/app/save_share/*` — see `learn-auth-share`.
- `backend/app/exports/*`, `backend/app/evaluation/*`, `backend/app/contiguity/*` — graph-
  backed metrics; see `learn-performance` for the graph-loading memory story behind them.
- `backend/app/sql/*` — legacy UDF SQL files; see
  [references/db-patterns.md](references/db-patterns.md) before touching or expanding these.
- `backend/tests/` — add/adjust tests alongside endpoint or DB-access changes.

## See also

- [references/db-patterns.md](references/db-patterns.md) — SQLAlchemy-first policy detail,
  the UDF exception, legacy UDF handling, migrations, and `ParentChildEdges` partition
  history.
- `learn-state-sync` — the client-side half of the `updated_at`/conflict contract.
- `learn-auth-share` — scopes and dependency guards for protected endpoints.
- `learn-performance` — graph-loading memory footprint and query-cost triage.
