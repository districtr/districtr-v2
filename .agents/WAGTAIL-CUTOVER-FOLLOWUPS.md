# Wagtail Cutover — Remaining Work & Follow-ups

Status as of 2026-06-11, branch `wagtail-cutover` (20 commits ahead of `dev`, all
quality gates green: backend 306 passed, cms 175 tests, frontend build clean).
All 13 cutover workstreams and all 10 verified code-review findings are fixed
and committed. This file tracks what was **deliberately deferred** — pick it up
in a future session. Plan context: `~/.claude/plans/review-these-conversation-notes-federated-mitten.md`
(local to Dylan's machine) and the project memory `wagtail-cutover-project`.

### Follow-up session 2026-06-11 — cleared the decision-free backlog

All items below marked **✅ DONE** were fixed and verified this session
(backend 306 passed, cms non-menu tests pass, frontend build + pre-commit
clean). Items marked **⏳ NEEDS DECISION** or **⏳ DEFERRED** remain. Details
inline. The flaky `TestCommenterEndpoint` fix was a real fragility:
`create_commenter_db`/`create_tag_db` returned `Model.model_construct(...)`
instances that bypass SQLAlchemy instrumentation and fail FastAPI response
serialization until the ORM mappers are configured by an unrelated test —
replaced with real `Model(**row._asdict())` instances.

---

## 1. Product decisions — RESOLVED 2026-08-04 (session with Dylan)

### 1.1 ✅ Editor scope: **own-content-only** (+ teams for manual control)
Shipped: `content/0004_editor_own_content_only` revokes the editor group's
tree-wide `change_page`; editors keep `add_page` (Wagtail's owner model grants
edit on owned pages) + `publish_page` (applies only to editable, i.e. own,
pages). `migrate_tiptap --owners "auth0|xx=email,..."` sets `Page.owner` from
the legacy `author` column (Auth0 subjects — the sub→email mapping must be
supplied at cutover; there are two distinct authors in the data).

### 1.2 ✅ group_only galleries: **enforced via Teams**
Shipped: the JWT carries a `map_groups` claim (slugs across the user's teams,
minted in [cms/authapi/serializers.py](../cms/authapi/serializers.py));
[cms/galleries/api.py](../cms/galleries/api.py) requires the gallery's
`map_group` slug in that claim, or the `admin` role. A merely-valid login no
longer opens group_only galleries. Scoping unit confirmed as `MapGroup`.

### 1.3 Refresh-token security posture (still open, low priority)
`BLACKLIST_AFTER_ROTATION` was turned **off**
([cms/config/settings/base.py](../cms/config/settings/base.py)) because Next.js
RSCs cannot persist rotated cookies — single-use tokens deterministically
bricked admin sessions. Trade-off: a stolen refresh token stays valid until its
own 14-day expiry. If tighter security is wanted later: implement a reuse
grace-window serializer (accept the previous token for ~60s after rotation),
or make middleware the *only* refresher and re-enable blacklisting.

---

## 2. Functional follow-ups (small, well-scoped)

| Item | Where | Notes |
|---|---|---|
| ✅ **DECIDED 2026-08-04: leave as-is** — District comments for tag-scoped reviewers | [backend/app/comments/main.py](../backend/app/comments/main.py) | Blanket 403 stays: scoped reviewers moderate community comments only; full reviewers/admins handle district comments. Menu link already hidden for scoped reviewers. |
| ✅ **DONE** — `/places` "N map modules" count | [app/src/app/(static)/places/page.tsx](../app/src/app/(static)/places/page.tsx) | Restored: card shows `N map module(s)` from the `districtr_map_slugs` the list endpoint returns. |
| ✅ **DONE** — GET `/auth/logout` CSRF | [app/src/app/auth/logout/route.ts](../app/src/app/auth/logout/route.ts) | Guarded with the Fetch-Metadata `Sec-Fetch-Site` header — an explicit `cross-site` GET bounces home WITHOUT signing out; same-origin/same-site/direct nav still log out. Chose this over the auto-submit-form approach: lower risk, no coupling to NextAuth CSRF internals, no redirect flash. |
| ⏳ **DEFERRED** (long-term) — PermissionGuard reads raw JWT client-side | [app/src/app/admin/components/PermissionGuard.tsx](../app/src/app/admin/components/PermissionGuard.tsx) | Now base64url-safe via shared `decodeJwtPayload`, but long-term the access token shouldn't need to reach the client at all — pass roles/scopes as typed session fields and keep the token server-side. Larger auth-session refactor; left as-is. |
| ✅ **DONE** — Flaky `TestCommenterEndpoint` (3 tests) | backend/tests/test_comments.py | Root cause: `create_commenter_db`/`create_tag_db` returned `model_construct(...)` instances bypassing ORM instrumentation, failing FastAPI response serialization until mappers were configured by an unrelated test. Fixed by returning real `Model(**row._asdict())` instances. Now passes in isolation, subset, and full suite. |

---

## 3. Performance — ✅ ALL DONE this session

- ✅ **`content_detail` fetches every language's full body** to compute
  `available_languages`, then serializes one
  ([cms/content/api.py](../cms/content/api.py)). Fixed: `values_list('locale__language_code')`
  for the language set + a single full fetch of the chosen page only.
- ✅ **`content_list` pulls full `body` columns for up to 100 rows** to emit a
  link list (backs `/tags`, `/places`, homepage PlaceMap). Fixed: `.defer('body')`.
- ✅ **`/api/galleries/` list has no offset/limit clamp** — fixed: mirrors
  `content_list`'s `MAX_PAGE_SIZE` (100) with `offset`/`limit` query params.
- ✅ **Token mint runs 4 queries where 2 suffice** (groups + assignments queried
  twice across `get_token`/`scopes_for_user`). Fixed: groups + assignments
  queried once in `get_token` and passed into `scopes_for_user` via new
  `group_names` / `has_review_assignments` kwargs.

---

## 4. Infrastructure / consistency

- ✅ **DONE** — **S3-vs-R2 client divergence** (decided: prod is **AWS S3**).
  All three sites now share one S3 contract: `get_s3_client` honors
  `AWS_S3_ENDPOINT` (optional S3-compatible host) and the R2 `ACCOUNT_ID`
  branching is gone (backend + `cms/datastore/services.py` +
  `cms/config/settings/production.py`). The `R2_BUCKET_NAME`-misnomer TODO is
  resolved: backend reads the bucket through a new `Settings.s3_bucket`
  property (`R2_BUCKET_NAME or AWS_S3_BUCKET`, matching cms `GPKG_BUCKET`); the
  legacy secret name is kept (it's live) but documented. The dead `ACCOUNT_ID`
  / `R2_ACCOUNT_ID` fields were removed (`extra="ignore"` makes a stale prod
  secret harmless). NOTE: backend now reads `AWS_S3_ENDPOINT` where it didn't
  before — if a prod `ACCOUNT_ID`/R2 secret is still set it is now ignored, so
  confirm prod is genuinely on S3 before/at cutover.
- ✅ **DONE** — **Permission-grant migration boilerplate ×3** (`datastore/0002`,
  `galleries/0002`, `authapi/0003`). Extracted `core/migration_utils.py`
  (`ensure_permissions` + `model_permissions`); all three migrations now use it.
  The `create_permissions` fresh-DB footgun lives in one documented place.
- ⏳ **DEFERRED** — **Datastore admin tool views** ([cms/datastore/views.py](../cms/datastore/views.py)):
  four hand-rolled form views with permission declared twice (view decorator +
  menu item kwarg). A small shared FormView base would make the fifth tool
  safe to add by construction. Left as-is — pure refactor, lower value.
- ✅ **DONE (partial)** — **cms fetch wrappers** ([app/src/app/utils/api/cmsContent.ts](../app/src/app/utils/api/cmsContent.ts)):
  the three per-function try/fetch/null blocks now share one `cmsFetch<T>()`.
  CMS URL resolution across three places (`auth.ts`, `admin/config.ts`,
  `cmsContent.ts`) NOT consolidated — `auth.ts` is the critical NextAuth path
  with server-only semantics; left untouched to avoid risk.
- ⏳ **DEFERRED** — **Dev JWT keys are ephemeral per process**
  ([cms/config/settings/dev.py](../cms/config/settings/dev.py)): fine for the
  single-process compose runserver, but `manage.py shell` mints tokens the
  server won't verify. Run `manage.py generate_jwt_keys` and pin them in
  `cms/.env.docker` if this bites. Also: `KidTokenBackend` mirrors SimpleJWT
  internals — re-check on any SimpleJWT upgrade.
- **`bd` issue tracker is broken locally** (`pending schema migrations alter
  pre-existing dirty tables`) — no beads issues were filed for any of this
  branch; repair bd and backfill if the team wants tracker history.

---

## 5. Cutover-day checklist (operational, unchanged from the plan)

1. DB snapshot.
2. Fly secrets — **cms**: `JWT_SIGNING_KEY`/`JWT_VERIFYING_KEY`
   (`manage.py generate_jwt_keys`), `DJANGO_SECRET_KEY`, `RESEND_API_KEY`
   (+ verify the Resend sending domain), DB + storage creds;
   **api**: `AUTH_JWKS_URL=https://districtr-v2-cms.fly.dev/.well-known/jwks.json`,
   `AUTH_ISSUER`, `AUTH_AUDIENCE`; **frontend**: `AUTH_SECRET`, `CMS_URL`.
3. Staging rehearsal on the `-dev` Fly apps first (full sequence below, plus a
   backend `alembic revision --autogenerate` afterward proving an empty diff).
4. Merge → CI deploys api/app/cms (release commands run both migration systems).
5. `manage.py migrate_tiptap --dry-run` → review report → real run **with
   `--owners "auth0|<sub>=<email>,..."`** (map the two legacy author subjects
   to provisioned users so their pages stay editable under own-content-only).
5b. In the Wagtail admin, add a "Static pages" index page under Home
   (StaticPage type, new 2026-08-04): static site pages migrate into the CMS
   one at a time — delete the hardcoded Next.js route, publish a StaticPage
   with the same slug (the `/[slug]` catch-all serves it).
6. `manage.py provision_users users.csv` (CSV: email,name,group) — sends
   password-setup emails.
7. Smoke: Wagtail login, edit+publish a page, comment moderation at
   `/admin/review`, thumbnail regen, gallery publish, compose-map dry call.
8. **Disable** (don't delete) the Auth0 tenant; delete after two quiet weeks.
9. One month post-cutover: ship the migration renaming `cms.tags_content` /
   `cms.places_content` → `*_legacy` (they must survive until then —
   `migrate_tiptap` reads them; alembic's `include_object` already ignores the
   `cms` schema).
