# 72. Maintenance mode gates the API with a polled per-worker flag

Date: 2026-11-18 (PR #845)

## Status

Accepted. Amends [0042](0042-version-skew-detection.md).

## Context

Maintenance mode (`cms.site_settings.under_construction`, toggled from the CMS's Frontend settings page) used to redirect only the frontend: `proxy.ts` sent page requests to `/under-construction`. The API kept serving, so editor tabs left open kept saving into a database that was about to be migrated, restored or resized. Planned downtime also had no way to warn people beforehand.

The gate had to cost nothing while maintenance is off. Reading the flag from the DB on every request would add a query to every API call. A cached read inside an async middleware would put blocking DB I/O on the event loop. LISTEN/NOTIFY needs a dedicated connection per worker and reconnect logic.

## Decision

`app/maintenance.py` keeps a per-worker snapshot of the settings row (the flag and the banner text) in module globals. A daemon thread per worker refreshes it every 15 seconds (`POLL_SECONDS`). The settings PATCH also writes it, so the worker that handled the save flips at once. A generation counter under a lock stops a poll that read the row before the PATCH committed from undoing it. A failed poll keeps the last value, so a worker that has seen maintenance on stays in maintenance while the DB is down.

`MaintenanceMiddleware` is pure ASGI and checks the global first, so while maintenance is off a request pays one function call and one global read (about 0.1 µs measured). While it is on, every path answers 503 with `Retry-After: 300`, except `/` (the ALB health check, so ECS doesn't cycle tasks) and `/api/cms/site_settings` (so the frontend can read the flag and banner, and an admin can switch it off). The middleware is added before CORS, so CORS wraps it and browsers can read the 503.

`GET /api/cms/site_settings` serves the snapshot, so browser polling costs no DB work and the endpoint keeps answering while the DB is down. `?fresh=true` reads the row; the CMS form uses it because it reads right after a save that another worker may have handled. The PATCH changes only the fields it is sent, and the CMS sends only the fields the admin changed.

On the frontend, one shared poller (`useSiteSettings` in `utils/api/siteSettings.ts`) runs on load, tab return, window focus (at most once a minute) and every minute while visible. `SiteBanner` shows the banner text and, when the CMS sets one, a live countdown to `downtime_at` ("down for scheduled maintenance in 10 minutes"). The countdown is a warning only: an admin still switches maintenance on by hand, which clears `downtime_at`. `MaintenanceDialog` blocks open tabs while maintenance is on and closes on the first check after it ends. `VersionCheck` ([0042](0042-version-skew-detection.md)) stands aside while maintenance is on, since reloading would only land on `/under-construction`.

## Consequences

Two switches now reach differently. The CMS flag stops the API as well as redirecting pages. The `UNDER_CONSTRUCTION=true` frontend env var still only redirects pages; it is the fallback when the backend itself is unreachable.

Other workers pick up a change within 15 seconds, the frontend proxy within a minute, and open tabs within about a minute. In-flight requests finish, and the nightly stats refresh isn't stopped. The runbook is therefore: start a countdown (say 10 minutes), switch maintenance on when it runs out, wait a few minutes, then start database work. The CMS help text says so.

CMS tools that call the API (submission moderation, imports, overlays, thumbnails) are paused along with everything else. A worker that starts during a DB outage serves ungated until its first good poll, but its requests fail on the DB anyway.

The prod CMS deploys only on a manual dispatch (`deploy-cms.yml`, `AWS_DEPLOY_CMS_PROD` unset), so a release that changes the settings form needs `gh workflow run deploy-cms.yml --ref main` after the main deploy.

If cross-worker lag ever matters, swap the poll for LISTEN/NOTIFY behind the same `set_state`.
