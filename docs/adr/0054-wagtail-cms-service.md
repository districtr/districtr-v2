# 54. The Districtr CMS: a separate Wagtail service for content, users, and data admin

Date: 2026-09-23 (PR #714; AWS service #716; homebrew CMS retired #717/#718; recorded retrospectively 2026-09-28)

## Status

Accepted.

## Context

Content, moderation, and data administration were spread across three surfaces. The public Next.js app carried an in-app `/admin` tree with a TipTap editor (the homebrew CMS, from PR #306 "Static site"; Auth0 sign-in from PR #327), whose backend tables held each page as two JSONB columns, `draft_content` and `published_content` — publishing moved one into the other, with no status enum. Comment review lived in the same tree. Map-module and overlay administration was CLI-only (`backend/cli.py`). Partners needed to author pages and moderate their own portals without developer help, and none of these surfaces had per-user roles or review workflows.

## Decision

A separate Django 5.2 / Wagtail 7 service under `cms/` (PR #714) owns everything editorial: portal, place, and static pages; users, teams, and roles; submission moderation; and admin of map modules and overlays. Its apps are `authapi` (identity, [0055](0055-cms-identity-provider.md)), `content` (pages), `datastore` (mirrors of backend tables, [0056](0056-cms-schema-ownership.md)), `moderation` (site settings), and `portals` (the portal hub, [0061](0061-map-portal-ownership-collection-modes.md)).

- **Publishing** is Wagtail page revisions behind an "Admin approval" workflow — a single `GroupApprovalTask(admin)` (`cms/content/migrations/0002_provision_site.py`) — so partners submit pages and admins publish.
- **The public site renders CMS content** from an anonymous JSON API: `/api/content/<type>/slug/<slug>`, `/api/content/<type>/list`, and `/api/content/preview/<uuid>` (`cms/content/api.py`), serving live pages only with English fallback. The frontend's `StreamRenderer` walks StreamField blocks, and the portal, place, and static routes export `revalidate = 3600` but call `cookies()`, so Next renders them on every request (PR #717; caching is an open item in `docs/WAGTAIL-CUTOVER-FOLLOWUPS.md`). Draft previews are `PreviewSnapshot` rows that live one hour; the row id is the capability.
- **The homebrew CMS is retired**: PR #717 deleted the in-app `/admin` tree and the TipTap stack (net −4,500 lines); PR #718 deleted the backend `cms` content module. Legacy pages convert to StreamField through the reversible data migration `content/0003_import_legacy_content.py` (`migrate_tiptap`). The under-construction toggle (PR #603) survives as a Wagtail view over `PATCH /api/cms/site_settings`.
- **Deployment** (PR #716) is one Fargate task with no autoscaling (sized for about 20 admin users on the assumption that incremental static regeneration would shield public reads; it does not yet, see above), on a `cms[.dev].districtr.org` host rule on the shared ALB of [0043](0043-aws-platform.md). A one-off migrate task gates each rollout (`.github/workflows/deploy-cms.yml`). PR previews ([0051](0051-pr-previews-dev-stack.md)) share the dev CMS rather than getting their own. Docker Compose gains a `cms` service.

## Consequences

The Wagtail admin is the only signed-in surface; the public Next.js site has no sign-in at all. The system gains a fifth deploy unit alongside the four of [0002](0002-founding-stack.md). Content changes no longer need a frontend deploy, and block rendering is not covered by frontend tests (PR #717 checked parity by eye). The legacy `cms.tags_content` and `cms.places_content` tables stay until `migrate_tiptap` no longer needs them as a source (cutover runbook step 15).
