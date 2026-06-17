# PR Preview Deploys (Fly.io)

Ephemeral Fly.io previews driven by PR labels.

| Label | What spins up | Backend / DB |
| --- | --- | --- |
| `Preview: FE` | Frontend only | Shared **dev** backend + dev database |
| `Preview: Fullstack` | Frontend **and** backend | Postgres **forked from dev**, isolated |

If both labels are present, `Preview: Fullstack` wins.

Apps are named with the PR number:

- Frontend: `https://districtr-v2-<PR>-frontend-dev.fly.dev`
- API (fullstack only): `https://districtr-v2-<PR>-api-dev.fly.dev`
- DB (fullstack only): `districtr-v2-<PR>-db-dev` (forked Postgres cluster)

## Lifecycle

- **Deploy** ([`fly-preview.yml`](workflows/fly-preview.yml)) runs on PR `opened`, `reopened`,
  `synchronize` (new commits), and `labeled` — i.e. alongside the other PR actions. It only
  does work when a preview label is present, and is skipped for fork PRs (which have no secrets).
- **Teardown** ([`fly-preview-teardown.yml`](workflows/fly-preview-teardown.yml)) runs on PR
  `closed`/merged, and also when the last `Preview:` label is removed. It only destroys apps
  named after the PR number, so the shared dev apps are never touched.

A sticky PR comment is created/updated with the live URLs, and rewritten to "torn down" on cleanup.

## One-time setup

### 1. Create the two PR labels

```bash
gh label create "Preview: FE" --color 0E8A16 --description "Deploy a frontend-only Fly preview"
gh label create "Preview: Fullstack" --color 5319E7 --description "Deploy a full-stack Fly preview (forked DB)"
```

### 2. Allow preview origins on the shared dev backend (needed for `Preview: FE`)

Frontend-only previews call the shared dev backend cross-origin. Set a CORS regex once so any
preview frontend is allowed (this is read by `BACKEND_CORS_ORIGIN_REGEX` in `backend/app/core/config.py`):

```bash
fly secrets set 'BACKEND_CORS_ORIGIN_REGEX=^https://districtr-v2-\d+-frontend-dev\.fly\.dev$' -a districtr-v2-api-dev
```

### 3. Repository **variables** (Settings → Secrets and variables → Actions → Variables)

| Variable | Description | Example |
| --- | --- | --- |
| `FLY_ORG` | Fly org slug that owns the apps | `mggg` |
| `DEV_PG_APP` | Dev Postgres cluster to fork (fullstack) | `districtr-v2-db-dev` |
| `R2_BUCKET_NAME` | R2 bucket for the preview backend (optional) | `districtr-v2-dev` |

### 4. Repository **secrets**

| Secret | Used by | Notes |
| --- | --- | --- |
| `FLY_PREVIEW_API_TOKEN` | both | **Org-scoped** token: `fly tokens create org`. The existing app-scoped tokens cannot create/destroy apps. |
| `AUTH0_SECRET` | frontend | Auth0 session secret |
| `AUTH0_CLIENT_ID` | frontend | |
| `AUTH0_CLIENT_SECRET` | frontend | |
| `AUTH0_DOMAIN` | both | Domain only, no `https://` |
| `AUTH0_API_AUDIENCE` | both | API identifier; FE uses it as `AUTH0_AUDIENCE` |
| `RECAPTCHA_SITE_KEY` | frontend | Public, baked at build |
| `NEXT_PUBLIC_MAPTILER_API_KEY` | frontend | Public, baked at build |
| `SENTRY_AUTH_TOKEN` | frontend | Optional, for source maps |
| `PREVIEW_DB_USER` | backend (fullstack) | Dev cluster Postgres user (the fork keeps it) |
| `PREVIEW_DB_PASSWORD` | backend (fullstack) | Dev cluster Postgres password |
| `PREVIEW_DB_NAME` | backend (fullstack) | Dev cluster database name |
| `BE_SECRET_KEY` | backend (fullstack) | Backend `SECRET_KEY` (not `"changethis"`) |
| `AUTH0_ISSUER` | backend (fullstack) | Full issuer URL |
| `AUTH0_ALGORITHMS` | backend (fullstack) | e.g. `RS256` |
| `RECAPTCHA_SECRET_KEY` | backend (fullstack) | Optional |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | backend (fullstack) | Optional, R2/S3 access |
| `R2_ACCOUNT_ID` | backend (fullstack) | Optional, Cloudflare R2 account id |

## Caveats

- **Auth0 callbacks.** Auth0 requires explicit Allowed Callback/Logout/Web-Origin URLs and does
  not support wildcards for `*.fly.dev`. Login on a preview won't work until
  `https://districtr-v2-<PR>-frontend-dev.fly.dev/auth/callback` is added to the Auth0 app (manually
  or via the Auth0 Management API). Public, non-admin pages work without this.
- **Fullstack cost & timing.** Forking the Postgres cluster copies the dev volume — the first deploy
  can take several minutes and the running cluster costs money until teardown.
- **gerrydb volume.** The forked backend gets a fresh, empty `gerrydb_views` volume; the local
  gerrydb cache repopulates from R2 on demand. Some geospatial validation may be slower until then.
- **Sizing.** Preview backends are downsized to 2 GB RAM (`--vm-memory 2048` in the workflow); adjust
  there if a preview needs more.
