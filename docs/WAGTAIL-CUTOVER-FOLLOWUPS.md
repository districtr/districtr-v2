# Wagtail cutover runbook and open items

This file describes the cutover as merged. It covers what the merged code does, the ordered cutover checklist, and the follow-up ledger. "Tracked" means the item has an issue in the beads tracker. Git history holds the path that led here.

## What the merged code does

### Auth

- The Wagtail CMS (`cms/`) issues every user JWT. Tokens are RS256 with a `kid` header (`cms/authapi/tokens.py`). The public keys are served at `/.well-known/jwks.json` (`cms/config/urls.py`).
- There is no login or refresh endpoint and no refresh token. The Wagtail admin uses Django sessions. Admin views that call the backend mint a 5-minute access token per request with `mint_user_access_token` (`cms/authapi/serializers.py`). Claims are rebuilt on every mint, so a role or team change applies on the user's next action.
- The frontend holds no user credentials. NextAuth, the `/auth` routes and `AUTH_SECRET` are gone. Editors sign in at the CMS, and the site footer links to `<CMS>/admin/`.
- The backend verifies tokens with `AUTH_JWKS_URL`, `AUTH_ISSUER` and `AUTH_AUDIENCE` (`backend/app/core/security.py`). Infra derives them from `cmsDomain` and `jwtAudience` (`infra/backendtask.ts`).
- `manage.py issue_service_token` mints service tokens with explicit scopes.
- No application code calls Auth0. The only remaining use of Auth0 data is mapping legacy page authors during the content import.

### Roles and team scoping

- Three groups exist (`cms/authapi/migrations/0002_provision_roles.py`). `admin` has full page and datastore permissions. `partner` edits its own pages. `super_partner` adds the map-module and overlay tools. GPKG import is admin only.
- Partners hold `add_page` only on the Portals and Places index pages (`authapi/0004`). Their edits go through the "Admin approval" workflow (`content/0002`), so an admin publishes.
- Teams are the tenant boundary. The JWT carries a `teams` claim of team slugs for every non-admin. Admins get no claim and hold `review:review-all`.
- The backend's `require_portal_admin` (`backend/app/submissions/main.py`) intersects the `teams` claim with `form_configs.admin_teams`. A missing or empty claim gets a 403. `review:review-all` is the only bypass.
- In the CMS, `user_is_team_scoped` (`cms/authapi/teams.py`) scopes every signed-in non-admin. A partner with no team reaches nothing.
- Portal pages are scoped by their FormConfig's `admin_teams` (`portal_slugs_for_user` in `cms/authapi/teams.py`). A portal with no FormConfig belongs to no team.
- Only admins can create or copy a FormConfig (`FormConfigPermissionPolicy` in `cms/datastore/wagtail_hooks.py`). Partners get portals from the portal wizard (`cms/content/portal_wizard.py`). The wizard creates a draft page and its FormConfig together.
- Only admins manage Teams (the Teams snippet in `cms/authapi/wagtail_hooks.py`).

### Submissions and moderation

- `comments.form_configs`, `comments.submissions` and `comments.submissions_content` replace the legacy comment tables (`backend/app/submissions/models.py`).
- Migration `d8f1b52c96e3` drops the legacy comment tables without converting their rows. Production held five legacy form comments, four of them test rows.
- Zone notes live in `comments.district_notes` (`backend/app/district_notes/`).
- A map belongs to at most one portal through `document.portal_id` (migration `f3a9c1d27e58`). `submissions.tags` no longer exists.
- Moderation needs no review. Text scoring sets `nsfw` automatically, and the frontend blurs those entries (`backend/app/submissions/moderation.py`). District notes get the same scoring, and nsfw notes show a placeholder in public reads. District notes have no human moderation control.
- The human controls are Blur and Hide, both in the Portals hub gallery. Hide removes an entry from every public listing, filtered or not. It does not delete the map, which stays reachable at `/map/<public_id>` by design.
- `form_configs.accepting` mirrors whether the portal page is live (migration `a7c2e9d4b150`). The CMS sets it on publish, unpublish and delete (`PortalPage.sync_accepting`). A closed portal takes no public submissions, starts no drafts, and lists nothing publicly. Its admins still see everything in the hub.
- Moderation never sends private answers (email) to the scorer.
- There is no review queue. The Portals hub (`cms/portals/`, at `/admin/portals/`) replaced it. The hub has a portal index, a per-portal gallery with filters for flagged, hidden and nsfw entries, and a per-portal metrics page. The old `/admin/moderation/portals/` URL redirects to the hub.
- A WAF rule limits `/api/submissions/flag` to 20 requests per IP per 5 minutes (`rate-limit-flag` in `infra/waf.ts`).

### Collection modes

`FormConfig.collection_mode` (`cms/datastore/models.py`, checked in `backend/app/submissions/models.py`) takes one of four values:

- `internal` collects maps made from the portal and shows them only in the admin gallery.
- `auto_public` collects maps into the public gallery once they are marked in progress or ready to share. There is no form.
- `prompt` asks the author to submit with a short form when a map is marked ready to share. This is the default.
- `form` shows a form on the portal page. Maps are not collected automatically.

### Content

- `TagPage` is now `PortalPage` and `TagsIndexPage` is now `PortalsIndexPage` (`content/0006`). The tables keep their old names. The index page keeps the slug `tags`, and the frontend serves portals at `/portal/<slug>`.
- `content/0002_provision_site` creates the Portals, Places and Static index pages, the locales, and the Admin approval workflow.
- `content/0003_import_legacy_content` runs `migrate_tiptap` during `migrate` to import `cms.tags_content` and `cms.places_content`. If legacy rows exist and `MIGRATE_TIPTAP_OWNERS` is unset, the migration refuses to run.
- The content API (`cms/content/api.py`) serves the types `portals`, `places` and `static`. It also accepts `tags` as a temporary alias for `portals`. The backend's `/api/documents/list` likewise accepts `tags` as an alias of `portal_ids`, so a frontend built before the cutover keeps its filtered galleries.
- A plan gallery marked "List this portal's plans" (`thisPortal`) and every comment gallery on a portal page get the portal's id when served, never stored. The wizard's galleries use this, so a slug rename carries them along.
- The backend's `app/cms` package now only serves site settings (`/api/cms/site_settings`, the under-construction flag).

### Tests

- Frontend unit tests run with `bun run test` (`bun test` over `*.test.ts` under `app/src`). CI runs them in `.github/workflows/test-app.yml`.
- CMS tests run in `.github/workflows/test-cms.yml`. Backend tests run in `.github/workflows/test-backend.yml`.

## Cutover checklist

Infra supports AWS only. The CMS runs as its own Fargate service (`infra/cms.ts`) behind the shared ALB on `cms.districtr.org` and `cms.dev.districtr.org`. `.github/workflows/deploy-cms.yml` deploys it.

**Before merging this stack to `dev`**, dump the dev stack's `comments` schema. `deploy-api.yml` runs `alembic upgrade head` on every push to `dev` that touches `backend/**`, and migration `d8f1b52c96e3` drops the legacy comment tables. Dev holds live legacy testimony from the TN workshop. Use the same `pg_dump` command as step 1 against the dev database.

**Rollback.** The legacy-table drop ships with the code switch. While old backend tasks drain during the rolling deploy, document loads on those tasks return 500. An image-tag rollback past the cutover doesn't work, because the old code reads the dropped tables. Rolling back means restoring the step 1 snapshot.

1. Take an RDS snapshot. Then dump the legacy comments schema:
   `pg_dump --schema=comments --format=custom -f legacy-comments.dump "$DATABASE_URL"`.
   Migration `d8f1b52c96e3` drops the legacy comment tables without converting their rows. This dump is the backfill source if any row is ever wanted.
2. Set the stack secrets with `pulumi config set --secret` on each stack. `infra/config.ts` requires `djangoSecretKey`, `jwtSigningKey` and `jwtVerifyingKey`. Neither stack file has them yet. Generate the key pair with `manage.py generate_jwt_keys`. `secretKey` and `s3BucketName` are also required and already set. Set `resendApiKey` too, because `provision_users` emails through Resend. Verify the Resend sending domain.
3. Set the GitHub repo variables `CMS_URL_DEV` and `CMS_URL_PROD`. `deploy-app.yml` bakes them into the frontend as `NEXT_PUBLIC_CMS_URL`.
4. Run `pulumi preview` on prod and read the certificate diff. `infra/alb.ts` adds `cmsDomain` to the certificate SANs, which replaces the ACM certificate. Create the validation and `cms.*` records from `pulumi stack output dnsRecords`.
5. Get the legacy page-author mapping ready. `content/0003` needs `MIGRATE_TIPTAP_OWNERS="auth0|<sub>=<email>,..."` for any legacy content to import. Use `unowned` to import admin-only pages on purpose. The mapping names people by email and the stack files are public, so set it as a secret: `pulumi config set --secret migrateTiptapOwners '<mapping>'`. `infra/cms.ts` passes it to the `cms-migrate` task only, through SSM. Remove it after the cutover deploy.
6. Find the legacy galleries that filter by map tags. Production's old create button stamped `metadata.tags`, and old galleries matched on it. The new gallery matches `document.portal_id` plus a visible submission, and nothing backfills those, so these galleries go empty. Count the tagged maps on prod first:
   ```sql
   SELECT tag, count(*)
   FROM document.document,
        json_array_elements_text(map_metadata->'tags') AS tag
   WHERE json_typeof(map_metadata->'tags') = 'array'
   GROUP BY tag ORDER BY 2 DESC;
   ```
   After the content import, turn each plan gallery whose `tags` hold one of these into curated `ids`. The ids for one tag:
   ```sql
   SELECT public_id FROM document.document
   WHERE json_typeof(map_metadata->'tags') = 'array'
     AND (map_metadata->'tags')::jsonb ? '<tag>'
     AND map_metadata->>'draft_status' = 'ready_to_share'
   ORDER BY updated_at DESC;
   ```
7. Rehearse the full sequence on the dev stack. Run `manage.py migrate_tiptap --dry-run` and review its report. Afterward, run `alembic check` in the backend. The only drift it may report is pre-existing and outside this stack: `evaluation.county_demographics`, the `overlay` timestamps, `custom_style` and `overlay_id` constraint, the `district_unions` indexes and timestamps, and `ix_document_document_num_districts`. Anything else, and especially a dropped `document_portal_id_fkey`, is a real diff.
8. Merge to `main` with `AWS_DEPLOY_CMS_PROD` unset. `infra.yml` applies the stack, including the owner-mapping secret, and the api workflow migrates the backend. Before the CMS migrates, confirm the migrate task has the secret:
   ```bash
   aws ecs describe-task-definition --task-definition cms-migrate --query 'taskDefinition.containerDefinitions[0].secrets[].name'
   ```
   The list must include `MIGRATE_TIPTAP_OWNERS`. Then run `deploy-cms.yml` by hand, or set `AWS_DEPLOY_CMS_PROD=true`. It runs the CMS migrations as a one-off task before rolling the service. Without the secret, `content/0003` refuses to run, and a retry fails the same way.
9. Run `manage.py provision_users users.csv`. The CSV columns are `email,name,group`, and the groups are `admin`, `partner` and `super_partner`. The command emails each user a password-setup link.
10. Right after step 9, create the Teams as an admin. Add their members and map modules. `provision_users` has no team column, and a partner with no team sees nothing.
11. As an admin, add a Portal forms entry for each legacy portal. Set `portal_id` to the portal's slug and `admin_teams` to the owning teams. Until then the portal page shows no form and no partner can reach it. The entry opens for submissions when its page is live.
12. Smoke test:
    - Sign in to the Wagtail admin with a provisioned account.
    - Edit and publish a page as an admin. Edit a page as a partner and submit it for moderation.
    - In the Portals hub, create a portal with the wizard as a partner. On a portal gallery, hide an entry and restore it. Toggle an entry's blur.
    - Toggle under-construction mode (Settings, then Frontend settings) and turn it back off.
    - Regenerate a map module's thumbnail from its edit page.
    - Compose a throwaway module with Create map module. It is created hidden.
    - Load a portal page and a place page on the public site.
13. Disable the Auth0 tenant. Do not delete it. Delete it after two quiet weeks.
14. One month after cutover, rename `cms.tags_content` and `cms.places_content` to `*_legacy`. They must survive until then because `content/0003` reads them. Alembic's `include_object` already ignores the `cms` schema.

## Open items

| Item | Where | Status |
|---|---|---|
| Cache CMS-rendered pages before the first public portal launch. Portal, place and static pages read the language cookie, which forces dynamic rendering. `/portals` and `/places` are `force-dynamic`. Every pageview hits the CMS. | `app/src/app/(static)/` | Tracked |
| Backfill a FormConfig for each legacy portal. Nothing creates them, so checklist step 11 is manual. | `cms/datastore/` | Tracked |
| Pass `MIGRATE_TIPTAP_OWNERS` to the `cms-migrate` task. | `infra/cms.ts` | Done |
| Add a team column to `provision_users`. | `cms/authapi/management/commands/provision_users.py` | Tracked |
| Show empty-state help to partners with no team and to teams with no map modules. | CMS admin | Tracked |
| Split `backend/app/main.py` (about 2,000 lines) into routers by domain. | `backend/app/main.py` | Tracked |
| Reorganize `backend/tests/test_main.py` by domain. | `backend/tests/test_main.py` | Tracked |
| Enforce sessions on `POST /api/submissions/flag`. `SESSION_ENFORCE` is `false`, so `require_session` only logs. The WAF rate rule is the stopgap. | `infra/backendtask.ts`, `backend/app/core/security.py` | Tracked |
| Add a section and a prefill flag to custom form questions. Prefilled answers are keyed by question key alone, so two portals with the same key share answers. | `FormFieldCustom` in `backend/app/submissions/models.py` and `cms/datastore/models.py` | Tracked |
| Make `collection_mode` immutable once the portal page is published. Portal forms still edit it freely. | `cms/datastore/wagtail_hooks.py` | Tracked |
| Enforce the portal module allow-list on the server. `allowListModules` is checked only in the browser. | `app/src/app/components/Forms/MapSelector.tsx` | Tracked |
| Validate DistrictrMap layer and tiles fields when the CMS edit form saves. | `cms/datastore/wagtail_hooks.py` | Tracked |
| Decide whether super partners manage their own team's membership. Team permissions are admin only today. | `cms/authapi/migrations/0002_provision_roles.py` | Tracked |
| Per-team image collections in the Wagtail image library. | CMS | Tracked |
| Content blocks for self-hosted video, a guide page hierarchy, and reusable snippets. | `cms/content/` | Tracked |
| Partner report generation needs a spec. The Portals hub metrics page may cover part of it. | `cms/portals/` | Tracked |
| Drop the `tags` content-type alias once every deployed frontend requests `portals`, and the `tags` alias on `/api/documents/list` one release after cutover. | `cms/content/api.py`, `backend/app/main.py` | Open |
| Dev JWT keys are generated per process, so `manage.py shell` mints tokens the dev server rejects. Pin keys from `generate_jwt_keys` in `cms/.env.docker` if this matters. `KidTokenBackend` copies SimpleJWT internals, so recheck it on any SimpleJWT upgrade. | `cms/config/settings/dev.py`, `cms/authapi/tokens.py` | Open |

## Done

- `/places` cards show the number of map modules again.
- `content_detail` reads the language list with `values_list`, and `content_list` defers `body`.
- The token mint queries groups once and passes them to `scopes_for_user`.
- Backend and CMS share one S3 client contract. `AWS_S3_ENDPOINT` is optional, and the R2 account branching is gone.
- Permission-grant migrations share `cms/core/migration_utils.py`.
- Frontend CMS reads share one `cmsFetch` wrapper (`app/src/app/utils/api/cmsContent.ts`).
- Team-less partners fail closed in both the CMS and the backend.
- The Portals hub replaced the review queues, and the Next.js `/admin` tree is gone.
