# Architecture Decision Records

Why the system is shaped the way it is, one record per decision, in [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Records are numbered in order of recording (0002–0053 were reconstructed in rough date order) and dated by the earliest PR evidencing the decision; each is PR-anchored so its claims can be re-verified. The Status column says whether a record still describes the code. Companion to [`../overview.md`](../overview.md) (the what); these records are the why. The reconstruction method and conventions are in [ADR 1](0001-record-architecture-decisions.md).

To add a decision: create the next-numbered `NNNN-slug.md` with the sections below, and add a row to the table. A decision that reverses an earlier one gets a new record and marks the old one Superseded; one that changes part of an earlier decision marks it Amended. Both records get the link: the new one says "Supersedes NNNN" or "Amends NNNN", the old one "Superseded by NNNN" or "Amended by NNNN", each with a link to the other record. Status is one of `Accepted`, `Superseded by …`, or `Accepted. Supersedes … / Amends … / Amended by …`. In prose, districts are "districts"; the code's `zone` column is named only when citing a concrete schema anchor.

```markdown
# NN. Title

Date: YYYY-MM-DD (PR #N; recorded retrospectively YYYY-MM-DD, if so)

## Status

Accepted.

## Context

What forced the decision, with the PR, issue, or migration id that evidences it.

## Decision

What was decided, in present tense, naming the code's own identifiers.

## Alternatives considered   (optional)

## Consequences

What follows, including what a later change would have to undo.

## Revisit when   (optional)
```

| ADR | Title | Date | Status |
|---|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | 2026-09-08 | Accepted |
| [0002](0002-founding-stack.md) | Founding stack | 2024-07-20 | Accepted |
| [0003](0003-founding-data-model.md) | Founding data model | 2024-07-24 – 2024-09-11 | Accepted |
| [0004](0004-sentry-monitoring.md) | Sentry for error monitoring | 2024-07-18 | Accepted |
| [0005](0005-docker-compose-dev-env.md) | Docker Compose as the standard development environment | 2024-09-23 | Accepted |
| [0006](0006-shatter-parent-child-model.md) | Two-level parent/child model for shattering | 2024-10-16 | Accepted. Amended by 0052 |
| [0007](0007-plain-object-store-state.md) | Map instance behind a getter; `Set`/`Map` stay in store state | 2024-10-17 | Accepted |
| [0008](0008-tiles-from-object-storage.md) | Tiles served from object storage via HTTP range requests | 2024-10-21 | Accepted |
| [0009](0009-format-lint-stance.md) | Format/lint stance: Prettier gated, ESLint available but not gating | 2024-10-28 | Accepted |
| [0010](0010-districtrmap-soft-delete.md) | Soft delete for DistrictrMap | 2024-11-18 | Accepted. Amended by 0056 |
| [0011](0011-web-workers-comlink.md) | Heavy geometry/tabular work in Web Workers via Comlink | 2024-12-23 | Accepted |
| [0013](0013-zundo-undo-redo.md) | Zundo for undo/redo | 2025-01-03 | Accepted |
| [0014](0014-react-map-gl-layer.md) | react-map-gl as the MapLibre integration layer | 2025-02-24 | Accepted |
| [0015](0015-server-side-contiguity.md) | Server-side contiguity via pickled graphs cached in the API process | 2025-03-05 | Accepted. Amended by 0052; PR #771 retired pickles |
| [0016](0016-central-store-subscriptions.md) | Cross-store side effects in central subscription modules | 2025-03-08 | Accepted |
| [0017](0017-sqlalchemy-first-no-udfs.md) | SQLAlchemy-first / no-new-UDFs policy | 2025-03-08 | Accepted |
| [0018](0018-districtrmap-slug.md) | DistrictrMap slug decoupled from GerryDB table name | 2025-03-17 | Accepted |
| [0020](0020-parquet-demographics.md) | Tabular demographics as long-format ZSTD parquet on CDN | 2025-04-28 | Accepted |
| [0021](0021-auth0-scopes.md) | Auth0 JWT with scopes for admin/CMS surfaces | 2025-05-05 | Superseded by 0055 |
| [0022](0022-share-model-public-ids.md) | Share model: the document UUID is the edit capability; public ids for everything else | 2025-08-06 | Accepted |
| [0023](0023-comment-moderation.md) | Comment moderation: OpenAI moderation API with local-lexicon fallback | 2025-09-02 | Superseded by 0059 and 0060 |
| [0024](0024-district-unions-cache.md) | district_unions: precomputed per-district cache table | 2025-09-05 | Accepted |
| [0025](0025-save-sync-model.md) | Save/sync model: IndexedDB drafts, automated server sync, derived dirtiness | 2025-12-19 | Accepted |
| [0026](0026-bun-runtime.md) | Bun as frontend runtime | 2025-12-19 | Accepted |
| [0027](0027-per-plan-num-districts.md) | num_districts: a per-plan override of the module value | 2026-02-03 | Accepted |
| [0028](0028-map-layer-separation.md) | Map drawing split into per-scope layer components | 2026-02-18 | Accepted |
| [0029](0029-district-comment-wholesale-sync.md) | District-comment sync replaces a district's comments wholesale | 2026-02-23 | Accepted. Amended by 0058 |
| [0030](0030-playwright-e2e-local.md) | E2E testing via Playwright, local/dev-only | 2026-03-13 | Accepted |
| [0031](0031-community-assignments-table.md) | Community mode: separate community_assignments table | 2026-03-23 | Accepted |
| [0032](0032-public-views-stats-artifact.md) | Public views read the published stats artifact | 2026-04-12 | Accepted |
| [0033](0033-centralized-frontend-constants.md) | Centralized constants directory with domain subfolders | 2026-04-24 | Accepted |
| [0034](0034-evaluation-metrics-json-payload.md) | Evaluation metrics as versioned JSON payload | 2026-04-29 | Accepted |
| [0035](0035-graph-lru-cache.md) | Graph LRU cache in the API process | 2026-05-06 | Accepted |
| [0036](0036-eguia-state-ideal-cache.md) | In-memory singleton cache for Eguia state ideals | 2026-05-13 | Accepted |
| [0037](0037-county-demographics-cache.md) | County demographics materialized in DB, keyed by GerryDB table name | 2026-05-13 | Accepted |
| [0038](0038-backend-reliability-policy.md) | Backend reliability policy: DB timeouts, slow-request logging, self-owned background sessions | 2026-05-28 | Accepted |
| [0039](0039-pipeline-built-hybrid-graph.md) | Single hybrid dual-level graph, built by the pipeline | 2026-06-10 | Accepted |
| [0040](0040-msgpack-wire-format.md) | msgpack wire format for assignment-heavy endpoints | 2026-06-10 | Accepted |
| [0041](0041-computation-placement.md) | Computation placement: graph in process over SQL on the request path | 2026-06-10 | Accepted |
| [0042](0042-version-skew-detection.md) | Version-skew detection: build stamping and forced reload of stale tabs | 2026-06-11 | Accepted |
| [0043](0043-aws-platform.md) | AWS platform on ECS Fargate, provisioned by Pulumi | 2026-06-26 | Accepted. Amended by 0052 |
| [0044](0044-graph-integrity-check.md) | Daily S3 graph comprehensiveness check with SNS alerting | 2026-07-06 | Accepted |
| [0045](0045-concurrency-ceilings.md) | Concurrency ceilings sized from stress-test evidence | 2026-07-15 | Accepted. Amended by 0052 |
| [0046](0046-assignments-departitioned.md) | Assignments tables departitioned | 2026-07-16 | Accepted |
| [0047](0047-stats-cdn-offload.md) | /stats offloaded to S3/CDN with staleness timestamps | 2026-07-17 | Accepted |
| [0048](0048-undo-redo-per-gesture.md) | Undo/redo per gesture, not time-throttled | 2026-07-21 | Accepted |
| [0049](0049-waf-session-tokens.md) | Edge protection: WAF plus stateless session tokens | 2026-07-22 | Accepted. Amended by 0055 |
| [0050](0050-turnstile-captcha.md) | Turnstile for public writes, two widgets with per-widget secrets | 2026-07-30 | Accepted |
| [0051](0051-pr-previews-dev-stack.md) | Ephemeral PR previews as label-driven clones on the dev stack | 2026-08-05 | Accepted |
| [0052](0052-mmap-shared-graphs.md) | Graphs memory-mapped and shared across workers | 2026-08-28 | Accepted |
| [0053](0053-fastapi-handler-dispatch.md) | FastAPI handler dispatch: `def` vs `async def` | 2026-09-04 | Accepted |
| [0054](0054-wagtail-cms-service.md) | The Districtr CMS: a separate Wagtail service for content, users, and data admin | 2026-09-23 | Accepted |
| [0055](0055-cms-identity-provider.md) | The CMS issues every RS256 access token the backend accepts; the backend verifies any JWKS-published token by scope | 2026-09-23 | Accepted. Supersedes 0021. Amends 0049 |
| [0056](0056-cms-schema-ownership.md) | One database, split schema ownership: Django owns `admin`, Alembic owns the rest | 2026-09-23 | Accepted. Amends 0010 |
| [0057](0057-roles-team-scoped-moderation.md) | Roles are Django groups; moderation is scoped by a fail-closed `teams` claim | 2026-09-23 | Accepted |
| [0058](0058-district-notes-table.md) | District notes split from public testimony into their own table | 2026-09-25 | Accepted. Amends 0029. Amended by 0062 |
| [0059](0059-submissions-form-configs.md) | Submissions: per-portal form configs over field/value rows replace the comment tables | 2026-09-25 | Accepted. Supersedes 0023, together with 0060 |
| [0060](0060-submissions-public-on-arrival.md) | Submissions are public on arrival; moderation is an automatic check plus admin takedown | 2026-09-25 | Accepted. Supersedes 0023, together with 0059. Amended by 0062 |
| [0061](0061-map-portal-ownership-collection-modes.md) | A map belongs to at most one portal; each portal chooses a collection mode | 2026-09-25 | Accepted |
| [0062](0062-deterministic-moderation-submissions-only.md) | Moderation is a deterministic word list, applied to portal submissions only | 2026-09-30 | Accepted. Amends 0058 and 0060 |
