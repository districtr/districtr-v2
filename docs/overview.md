# Districtr v2 — project overview

A newcomer-oriented tour of what the system is, what the words mean, and how the pieces fit. Architecture diagrams and per-directory detail live in [`architecture.md`](architecture.md); the history of *why* things are shaped this way lives in [`decisions.md`](decisions.md).

Districtr is a community redistricting platform: people draw district maps (assigning geographic units to districts) or community maps (marking communities of interest) in the browser, save and share them, and comment on them. The monorepo has four active parts: `app/` (Next.js frontend), `backend/` (FastAPI + PostGIS), `pipelines/` (offline data tooling), and `infra/` (Pulumi AWS deployment).

## Repository layout

```
/                                # Repo root
├── app/                         # Next.js frontend (Bun runtime)
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── src/
│       └── app/                 # Next.js app router root
│           ├── (interactive)/   # Route group: map viewer/editor pages
│           │   └── map/         #   /map, /map/[map_id], /map/edit/*
│           ├── (static)/        # Route group: static content pages
│           │   └── ...          #   /about, /guide, /places, /contact, etc.
│           ├── admin/           # Admin panel pages (Auth0-protected)
│           ├── components/      # React components
│           ├── constants/       # Constants and configuration
│           ├── hooks/           # Custom hooks
│           ├── lib/             # Auth0 and shared libraries
│           ├── store/           # Zustand stores, subscriptions, middleware
│           └── utils/           # Workers, API handlers, map helpers, IDB
├── backend/                     # FastAPI backend (Python)
│   ├── Dockerfile.dev
│   ├── cli.py                   # Management CLI (imports, map creation, edges)
│   ├── requirements.txt
│   └── app/
│       ├── alembic/             # Alembic DB migrations
│       ├── assignments/         # Zone assignments management
│       ├── cms/                 # Content management endpoints
│       ├── comments/            # Comments + moderation API
│       ├── contiguity/          # Geographic spatial contiguity
│       ├── core/                # DB, config, security, dependencies
│       ├── exports/             # Export data functions
│       ├── save_share/          # Save/share and password-protected access
│       ├── sql/                 # Legacy UDF SQL files (do not expand)
│       ├── thumbnails/          # Map thumbnail generation
│       ├── models.py            # SQLModel/SQLAlchemy models
│       └── main.py              # FastAPI entrypoint
├── pipelines/                   # Data pipelines (tilesets, tabular, transforms)
├── docker-compose.yml           # Orchestration
└── .env.example                 # Root env flags (LOAD_DATA, etc.)
```

## Vocabulary

The project's names are its biggest newcomer trap. The concordance, keyed by concept:

| Concept | In code | In UI / speech | Notes |
|---|---|---|---|
| A map **module** | `DistrictrMap` | "map" | A state's onboarded geographic setup — tiles, GerryDB tables, graph — what users pick from. |
| A map **plan** | `Document` | "map", "my map" | One user's work, created on a module. "The Colorado map" can mean either. |
| District-style map | `map_type: "default"` | "district map" | The word "district" never appears as a type value; `"default"` does not mean *the default kind*. |
| Locality map | `map_type: "local"` | small-town / locality map | Still district-style; the name's own TODO admits it's wrong. It does **not** mean local-to-the-user. |
| Community map | `map_type: "community"` | "community map" | Edited in `"coi"` mode (next rows). |
| The district/community axis | `map_type` (backend), `DocumentType` (`"district"`/`"coi"`, backend — derived from `map_type` at runtime in `main.py`), `MapMode` (`"districts"`/`"coi"`, frontend) | — | Three near-parallel enums, no shared source; which one a function switches on is unpredictable. |
| Communities of interest | `coi` | "community" / "communities" | `MAP_MODE_LABELS` maps `coi` → "community"; grepping "community" finds the map-type axis first. |
| Shatter | `shatter`, `ACTIVE_TOOLS.SHATTER` (~45 files) | "Break", "break down into blocks", "Block Mode", "Super Draw" | One feature, four names; the UI word "break" doesn't grep to the implementation. |
| Parent / child layers | `parent_layer` / `child_layer` on `DistrictrMap` | — | *Roles relative to a module*, not units: parent = coarse paintable layer (VTDs in one module, block groups in another), child = fine shatter target. `parent_layer` is NOT NULL everywhere — a non-shatterable module's only layer sits in `parent_layer` with no children; **shatterable = `child_layer IS NOT NULL`**. |
| Voting district | `vtd`, `GeoUnitType.VTD` | "precinct" | User-report vocabulary doesn't grep; `"bg"` ↔ "block groups". |
| Edit-link token | `private_edit_id` (URL param) | "edit link" | Base64url-shortened `document_id` (UUID) — same value, reversible encoding, no server lookup; it *looks* like a separate credential but isn't. |
| The two "last updated" values | `updated_at` vs `clientLastUpdated` | — | Different clocks (server vs browser); see the sync section. |
| Zone vs community id | `zone` column | district number / community | On community maps `zone` holds a `community_id`, with `0` as the unassigned sentinel. |

## Map modules and how they come to exist

A module a user can open is the join of a database record (`DistrictrMap`) and artifacts produced upstream by `pipelines/`: a PMTiles tileset, tabular parquet, and a contiguity graph. The backend only *reads* these artifacts — they are build products, never generated at request time. Onboarding order is fixed and enforced at the choke point (`backend/management/load_data.py`'s own docstring): GerryDB layer(s) → shatterable view (if applicable) → `DistrictrMap` record → parent-child edges. Layer names are baked into the pmtiles at build time and referenced by string from the config row — the frontend reads `parent_layer`/`child_layer` as literal PMTiles source-layer names. Parent-child edges are a spatial join between the two GerryDB layers, so a topology inconsistency silently produces a wrong or empty edge table rather than an error. The full procedure is the `run-map-onboarding` runbook.

## The interactive map

The map is a Zustand-store-driven render target: user gestures write to stores, subscribers translate store state into MapLibre paint and feature-state calls, and heavy geometry/tabular work runs in Web Workers (`GeometryWorker`, `ParquetWorker`) so painting keeps feeling synchronous under continuous mouse movement — the design's governing value. The paint path writes feature-state directly and synchronously from the store action; hover, focus, and zone coloring each own their own feature-state keys. Cross-store reactions are mostly wired in one place (`store/subscriptions.tsx`, `mapEditSubs.ts`), with mount-scoped subscriptions living in hooks (e.g. autosave). Assignments buffer during a gesture (`accumulatedAssignments`) and ingest once at gesture end — one coalesced write, one undo entry.

Page composition: `components/MapPage/MapPage.tsx` picks, via `isPublicPage`, between the interactive editor — `MainMap.tsx` (district mode) / `CoiMap.tsx` (community mode) — and `PublicMap.tsx`, the read-only map shown on a plan's share-link/Evaluate page. "Public" here means "read-only viewer," not a visibility/permissions property, and has no "private" counterpart; `PublicMap` renders pre-aggregated district geometry fetched from `/document/{id}/stats`, not the live block-level assignment state the editor works from. All three sit over a shared `MapContainer.tsx` shell. Layer components live under `components/Map/PolygonLayers/`; layer/style constants under `constants/map/`; the render subscriber is `utils/map/mapRenderSubs.ts`; MapLibre event wiring is `utils/events/mapEvents.ts`.

## Saving and syncing

Every document lives in three places: server (Postgres), this browser's IndexedDB copy (`utils/idb/idb.ts`, debounced 500ms writes), and in-memory stores. Two timestamps coordinate them: `updated_at` (the server's clock, on the document row) and `clientLastUpdated` (the browser's clock, stamped on every IDB write — local edits and successful syncs alike). Local-edit detection is derived by comparing them — equal means the last IDB write was a server sync; there is deliberately no dirty flag. A conflict is declared when the locally cached `updated_at` no longer matches the server's current one (another client saved in between).

`fetchDocument` (`utils/api/apiHandlers/fetchDocument.ts`) runs this comparison on every load and returns a `SyncConflictInfo` instead of silently picking a side. Four resolutions (`UseLocal`, `UseServer`, `KeepLocal`, `Fork` — `constants/document/sync.ts`, dispatched in `assignmentsStore.ts`) serve both the load-path and save-path conflict UIs. When the local copy wins a merge, two metadata fields are still always taken from the server: `overlays` and `statefps` are server-owned — no UI edits them locally, so local values are never information. The server's own optimistic-concurrency check (`update_assignments` compares the client's `last_updated_at` against the row, 409 unless `overwrite: true`) mirrors the same staleness question from the other side.

## Backend shape

A `Document` row (`backend/app/models.py`) carries plan metadata; assignments live in their own table `document.assignments` (`document_id`, `geo_id`, `zone`), one row per geography unit — tens of thousands per plan. Endpoints that touch both update the metadata `updated_at` deliberately, since the whole sync contract keys off that one timestamp. A document is reachable by its private `document_id` (UUID — possession grants edit rights; treat as a secret) or its `public_id` (small integer, read-only); the dependencies in `core/dependencies.py` enforce the boundary. Graph-backed metrics (contiguity, evaluation, exports) load a per-state adjacency graph — the system's expensive resource; see the `performance-memory` skill.

## Auth and sharing

Protected routes enforce scopes through `VerifyToken.verify` (`backend/app/core/security.py`) against Auth0-issued JWTs; the frontend's role→scope mapping is `app/src/app/lib/auth0.ts` (`SCOPES`), mirrored by the backend's `TokenScope` — the two lists have no compile-time link, so a scope added to one side alone silently does nothing. Share links mint a row in `document.map_document_token` (optionally with a bcrypt password); the returned JWT names *which* share record it refers to, not the document — the grant is looked up server-side when the link is used. Password-protected edit access is the one deliberate point where proving the password hands over the protected document. Share and session tokens are HMAC JWTs signed with the same key, separated only by `aud`/`exp` claims (`require_session`'s `require: ["exp", "aud"]` is the entire separation). Captcha (Cloudflare Turnstile) is verified server-side, with separate secrets per widget. **Note (2026-09-03): auth is slated for a revamp — verify this section against the code before relying on details.**

## CMS and comments

CMS content rows (`backend/app/cms/models.py`) carry `draft_content` and `published_content` as two columns, not a status enum — publishing moves draft into published and clears draft; there is no "in review" state on content. The rich-text editor is TipTap-based (`components/Cms/RichTextEditor/`), with the public page rendered separately by `RichTextRenderer` — **TipTap is slated for retirement; don't build on it.** Comment moderation scores text (OpenAI moderation or a local fallback) into `ReviewStatus`; rejected/over-threshold comments are masked with a placeholder in public responses rather than omitted, so counts stay truthful. District comments (zone-scoped, `DocumentComment`) sync by wholesale replacement: an incoming batch replaces that zone's comments — a UX decision, not a merge.

## Dev environment

`docker-compose.yml` is the source of truth; the facts that are easy to miss:

- In local compose, `frontend`'s `node_modules` is the **host's**, not the image's — the bind mount hides the image's copy, and `bun install` runs into the mounted host directory on every start, so a `package.json` change needs no image rebuild. (AWS is the opposite: the production image bakes dependencies in and mounts nothing.)
- Local Postgres is the version outlier: compose runs `postgis/postgis:15-3.3-alpine`; CI tests against `16-3.5-alpine`; production RDS runs Postgres 16. Behavior that differs across that boundary can pass in one environment and fail in another.
- Env files are per-service and gitignored (`backend/.env.docker`, `app/.env.docker`, `pipelines/.env`), each with a checked-in `*.example` template.

Deployment (AWS, Pulumi, previews, rollback): `infra/README.md`.
