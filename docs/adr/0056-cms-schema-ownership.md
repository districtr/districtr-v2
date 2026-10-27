# 56. One database, split schema ownership: Django owns `admin`, Alembic owns the rest

Date: 2026-09-23 (PRs #710, #713, #714; FormConfig mirror #747; recorded retrospectively 2026-09-28)

## Status

Accepted. Amends [0010](0010-districtrmap-soft-delete.md).

## Context

The Wagtail CMS ([0054](0054-wagtail-cms-service.md)) needs its own tables, and it needs to edit backend-owned rows (map modules, overlays, map groups). Two migration systems pointed at one database would each try to drop the other's tables: without a guard, "a backend autogenerate would propose dropping every Wagtail table" (PR #710). Multi-step data operations (GeoPackage import, map-module composition) existed only as backend CLI commands.

## Decision

The CMS runs against the backend's RDS database, with ownership split by schema:

- **Django owns `admin`.** The CMS pins `search_path=admin,public`, and `bootstrap_schema` creates the schema before `migrate` runs, so Django and Wagtail tables can land only in `admin`. The backend's `alembic/env.py::include_object` excludes the `gerrydb`, `admin`, and `cms` schemas by name; name-prefix guards are explicitly forbidden there.
- **Alembic owns everything else.** Backend tables the CMS edits are mirrored as `managed=False` Django models (`cms/datastore/models.py`: `GerryDBTable`, `DistrictrMap`, `MapGroup`, `Overlay`, the two junction tables, and `FormConfig` from PR #747 and `FormFieldCustom` from PR #753); `backend/app/models.py` stays the source of truth. The `document` schema and geometry tables are deliberately not mirrored.
- **Single-row edits go through the ORM; operations go through FastAPI.** Map modules, overlays, and link-table formsets are Wagtail snippets over the mirrors. Anything multi-step or moderation-related calls backend endpoints over HTTP with a CMS-minted token ([0055](0055-cms-identity-provider.md)) — `POST /api/admin/gerrydb/import` and `POST /api/admin/districtr-map/compose` (PR #713), thumbnails, submissions, site settings, evaluation. Compose checks cheap preconditions in-request and runs the rest as a background task; composed modules start hidden.

## Consequences

Each side runs its own migrations: the `cms-migrate` task runs `bootstrap_schema && migrate`, the backend migrate task runs Alembic. Mirror drift is a CI failure, not a runtime surprise: `.github/workflows/test-cms.yml` runs `makemigrations --check`, `alembic upgrade head`, then `check_mirror_drift`. To make rows editable by external admin tooling, PR #710 gave the junction tables single-column surrogate keys and restored `ON DELETE CASCADE` on map-group links, while `document.document` keeps `NO ACTION` so that maps with saved plans stay undeletable. The CMS therefore hard-deletes a map module only when no plan references it, and otherwise tells the admin to hide it with the visibility flag of [0010](0010-districtrmap-soft-delete.md). Changes to the backend-owned `cms.site_settings` table no longer autogenerate Alembic migrations, since that schema is excluded.
