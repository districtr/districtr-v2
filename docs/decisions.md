# Architectural decisions — a dated history

Why the system is shaped the way it is, in reverse-chronological order. Each entry is PR-anchored so its claims can be re-verified. Companion to [`overview.md`](overview.md) (the what); this file is the why.

## County data held in process memory (PR #773, in review 2026-10-01)

The county-splits and Eguia metrics need each parent layer's counties: their populations, and per election which party won each county. These used to be stored in `evaluation.county_demographics` (one JSON row per county per gerrydb table, written on first request and never refreshed), with a copy in each backend process on top. Adding an election column to an onboarded layer, the case PR #773 adds tooling for, left both copies stale, and refreshing them meant upserts from request threads in several processes, serialized by an advisory lock. `CountyContext` now aggregates a parent layer with one read-only `GROUP BY` query on first request (22–92 ms for the seven v2 VTD layers measured locally) and keeps the county populations and the Eguia ideals in process memory. An Eguia key the loaded ideals lack reloads that layer, so a newly added election appears without a restart; a correction to the values of an existing column shows only after a backend restart. Memory is bounded at about 2 MB per process: roughly 3,220 counties × two layer versions per state × about 40 numeric columns × 8 bytes, against about 2.6 GB per backend process. On the seven local layers the in-memory populations and ideals equal those computed from the table. The table held only derived data, so the same PR drops it (migration `55d7b369ed57`); the downgrade recreates it empty.

## Moderation goes deterministic, submissions only (2026-09-29)

- **A word list, not a model.** `backend/app/submissions/moderation.py` flags a submission when it contains a blocklisted phrase (whole-word, punctuation-insensitive). `blocklist.sha256` stores SHA-256 digests of the phrases, not the words; `python -m app.submissions.moderation "<phrase>"` prints a phrase's line and whether it's listed. The OpenAI endpoint and `safetext` are gone: same text, same verdict, no network call, no API key. The list is curated to spare identity terms and place/person names that tripped on testimony. The matched phrase is stored as `moderation_match` and shown to portal admins, so a false positive can be traced to its list entry. It replaces the 0–1 `moderation_score`, which a yes/no check can't fill meaningfully (migration `f1c6a3d85b20`). The check also runs inside the request's transaction, not as a background task: it takes under a millisecond and can't fail on the network, so an entry is never public before it's been checked.
- **District notes are not moderated.** They are the author's own annotations; the `nsfw`/`moderation_score` columns and the public placeholder are dropped (migration `e4b8c1f07a92`).
- **Flagged means blurred, never masked.** Card and table views both blur with an opt-in reveal. Portal admins see full text in the Portals hub and can blur, unblur, hide or restore.

## Wagtail cutover and portal submissions (PRs #710–#719, merged to dev 2026-09-23; stack #745–#772)

The custom CMS and Auth0 are replaced by Wagtail, and the comment system by portal submissions. The choices that shape it, with where to re-verify each:

- **The CMS is the only token issuer.** It mints RS256 tokens with a `kid` per request (`mint_user_access_token`), with no refresh tokens and no login endpoint. The backend verifies against the CMS's JWKS. A role or team change applies on the next action.
- **Team scoping fails closed.** A non-admin with no team, or a token without a `teams` claim, reaches nothing in the CMS or the backend (`require_portal_admin`). `review:review-all` is the one bypass. Bypass-by-URL is this repo's historical bug class, so every scoped view resolves the portal and checks it.
- **No approval gate on submissions.** Entries are public on arrival. Automatic scoring blurs, and a reviewer can Hide. Hide delists everywhere but never deletes the map.
- **Clone at submission.** A submitted map is a frozen copy whose edit id nobody holds, so gallery entries can't drift from what was consented to. Auto-collect modes keep live references instead, and there is no consent form.
- **One portal per map** (`document.portal_id`). Membership and moderation authority share one key, so no map is listed where its reviewers can't take it down.
- **Portal identity is the default-locale slug**, resolved through `translation_key`. A translation's stale slug can't be claimed by another team.
- **A portal is open only while its page is live** (`form_configs.accepting`).
- **Legacy comments are dropped, not converted.** Production held five, four of them tests. The pg_dump in the runbook is the recovery path, and rollback past the cutover is a snapshot restore.
- **`tags` stays as an alias for one release**, on both the CMS content API and `/api/documents/list`, so a frontend deployed before the cutover keeps working during the rollout.

## Graphs become mmap-shared (PR #721, merged to dev 2026-08-28)

Every uvicorn worker unpickled its own private copy of every district graph it touched (~500MB per worker for Pennsylvania-scale data). `DualLevelDualGraph` replaces the pickled `networkx.Graph` with a numpy/scipy representation whose arrays are memory-mapped, so all workers in a container share one physical copy. Measured at PA-scale (346K nodes / 1.08M edges): per-process resident memory 428MB → 70MB; whole-US across 5 workers 44.7GB → ~3GB flat; cold load 1.3–2.2s → ~0.25s; contiguity check ~5–9x faster. An `igraph` alternative was measured and set aside — its sharing depends on `fork()` copy-on-write surviving sustained traffic, weaker than mmap's guarantee. Validation method worth copying: both implementations run against 152 sampled production documents and diffed. The PR also migrated every runtime reader off the `ParentChildEdges` table, and its migration (`2ecf1bdc582b`) dropped the dependent UDFs (`shatter_parent`, `unshatter_parent`, the `get_block_assignments` overloads) as dead code — interactive shattering is applied client-side from graph children served by `GET /api/gerrydb/edges/`. The table itself survives write-only: onboarding still populates it, nothing reads it, and dropping it is the remaining follow-up.

**The drop that was tried too early**: on 2026-07-17 a commit removed `ParentChildEdges`, its CLI commands, and the dependent UDFs outright; it was reverted on 2026-08-06 before reaching `dev` — the graph subsystem it depended on hadn't landed yet. With #721 merged that dependency is gone; `ParentChildEdges` stays partitioned (LIST by `districtr_map`) but write-only, awaiting the table drop.

## Assignments tables departitioned (PR #625, merged 2026-07-16)

`document.assignments` and `document.community_assignments` had been LIST-partitioned per document: every document creation ran `CREATE TABLE ... PARTITION OF ...`, taking an ACCESS EXCLUSIVE lock on the parent table. Under stress-test load (12,750 simulated users) this convoyed every assignment read/write behind document creations — ~93% request failure with app and DB CPU both idle, lock waits confirmed in RDS Performance Insights. Migration `7e57b49573e0` converted both to plain tables; document creation now does no DDL. The migration is deliberately irreversible (downgrade raises; rollback is a DB snapshot) — documented in its own docstring, the worked example of stating that tradeoff. A HASH-partitioning alternative was measured and rejected: the composite-PK lookup was ~4ms of a ~115ms query, so partitioning the cheap part bought nothing. Repartitioning these tables would reintroduce the convoy.

## Undo/redo per gesture (PR #634, Jul 2026; regression fix `07af68f6`)

Undo snapshots moved from a 3-second throttle to one entry per gesture. That exposed a bug the throttle had masked: the auto-heal that can follow a paint bumped `clientLastUpdated` milliseconds after the gesture's own ingest, producing two history entries. The fix suppresses undo tracking around the heal's `set()` call so healing folds into the gesture that triggered it. The standing rule: any new automatic post-paint side effect folds into the triggering gesture's undo entry, not a new one.

## Server memory: the graph LRU cache (PR #540, merged 2026-05-06; cap raised PR #623)

API-server memory climbed to ~7GB in production: the graph cache had no eviction, so one process could hold every state's graph. Fix: an LRU cap (`_GRAPH_CACHE_MAX_SIZE`, now in `backend/app/evaluation/graph_loader.py`) plus a debug endpoint for hit/miss stats. The cap started at 10, raised to 15 by PR #623 (2026-07-15) — too small a cap forces multi-second cold S3 reloads; verify the live value in `graph_loader.py`. An LRU bounds memory per cache, not per process — the per-worker duplication is what PR #721 addresses.

## Computation placement (PR #550, merged 2026-06-10; PR #470, merged 2026-01-29)

`GET /document/{id}/unassigned` ran `ST_Union(ST_Envelope(...))` + `ST_Transform` across every unassigned geometry in PostGIS on every request, when the caller only needed which units cluster together. The fix deleted the geometry work: grouping moved to `networkx.connected_components` over the parent-layer graph the server already had cached, SQL shrank to enumerating unassigned `geo_id`s, and the client computed bboxes from centroids it already held. Same PR swapped assignment-heavy endpoints from JSON+Pydantic to msgpack. PR #470 is the browser-side counterpart: geometry-worker memory pressure and per-tile parquet requests fixed by reducing duplication and re-requests. The legacy PostGIS path (`get_unassigned_bboxes_udf*.sql`) is retained but not live.

## Map layer components separated (PR #492, Feb 2026)

A single monolithic `Map.tsx` was split into `MapContainer` (shell), `MainMap`/`CoiMap` (mode shells), `MapLayerAnchors` (render-order anchors), and per-scope layer components. A change that reintroduces cross-cutting drawing logic in one component is reversing this split.

## Sync design: derived dirtiness, server-owned fields, wholesale comment sync

Three deliberate choices in the edit-sync model (see `overview.md` for the mechanics):

- **No dirty flag** — local-edit detection is derived from comparing `updated_at` and `clientLastUpdated`, two timestamps already stored for other reasons, so it cannot fall out of sync with reality.
- **`overlays`/`statefps` are server-owned** — never locally editable; even a local-wins merge layers them in from the server, because local values of fields no UI edits are never information.
- **District-comment sync replaces a zone's comments wholesale** — an incoming batch is not merged with what's stored. A defeasible UX decision, not an invariant.

## CMS publishing: two columns, no status enum (retired by the Wagtail cutover)

The custom CMS kept `draft_content` and `published_content` as separate JSONB columns; publishing moved and cleared. Wagtail's revisions and the "Admin approval" workflow replace it, and the legacy `cms.*_content` tables are read only by the one-time content import.
