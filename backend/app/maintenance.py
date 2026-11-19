"""Maintenance mode for the API.

While `cms.site_settings.under_construction` is on, every route answers 503
except the ALB health check (`/`, so ECS doesn't cycle the tasks) and
`/api/cms/site_settings` (so the frontend can still read the flag and banner,
and an admin can switch it back off).

Each worker keeps a snapshot of the settings row, refreshed by a daemon
thread, so a request pays a single global read — no DB query, no lock —
whether the mode is on or off. The public settings GET serves the same
snapshot, so it keeps answering while the DB is down.

Writers go through `set_state` (the poller, and the settings PATCH so its own
worker flips at once). Readers use `maintenance.enabled`, never
`from app.maintenance import enabled`, which would bind a copy.

See docs/adr/0072-maintenance-mode-gates-the-api.md.
"""

import logging
from datetime import datetime
import threading
import time

from sqlalchemy import text
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.constants import CMS_SCHEMA
from app.core.db import engine

logger = logging.getLogger(__name__)

# ponytail: polling, one PK read per worker per interval; LISTEN/NOTIFY if
# instant cross-process flips ever matter.
# Quoted in the CMS Frontend settings help text ("up to 15 seconds").
POLL_SECONDS = 15
EXEMPT_PATHS = frozenset({"/", "/api/cms/site_settings"})
QUERY = text(
    f"SELECT under_construction, banner_message, downtime_at, feature_flags "
    f"FROM {CMS_SCHEMA}.site_settings "
    "WHERE id = 1"
)

enabled = False
banner_message: str | None = None
downtime_at: datetime | None = None
# Frontend feature flags, passed through untouched (app/cms/models.py).
feature_flags: dict = {}
# False until the first successful poll or PATCH in this worker; the settings
# GET reads the DB until then rather than serve a default.
loaded = False
# Bumped by every write, so a poll that read the row before a PATCH committed
# can't overwrite the PATCH's newer values. Writes hold _lock; the request
# path reads without it.
_generation = 0
_lock = threading.Lock()


def _apply(
    under_construction: bool,
    message: str | None,
    downtime: datetime | None,
    flags: dict | None,
) -> None:
    global enabled, banner_message, downtime_at, feature_flags, loaded, _generation
    enabled, banner_message, downtime_at = under_construction, message, downtime
    feature_flags = flags or {}
    loaded = True
    _generation += 1


def set_state(
    under_construction: bool,
    message: str | None,
    downtime: datetime | None,
    flags: dict | None = None,
) -> None:
    with _lock:
        _apply(under_construction, message, downtime, flags)


def poll_once() -> None:
    seen = _generation
    try:
        with engine.connect() as conn:
            row = conn.execute(QUERY).one_or_none()
    except Exception as exc:
        # Keep the last value: a worker that has seen maintenance on stays in
        # maintenance while the DB is down. (A worker that starts during an
        # outage serves ungated until its first good poll; its requests fail
        # on the DB anyway.)
        logger.warning("Maintenance flag poll failed: %s", exc)
        return
    if row is None:
        return
    with _lock:
        if seen == _generation:
            _apply(
                bool(row.under_construction),
                row.banner_message,
                row.downtime_at,
                row.feature_flags,
            )


def _poll() -> None:
    while True:
        poll_once()
        time.sleep(POLL_SECONDS)


def start_maintenance_poller() -> None:
    threading.Thread(target=_poll, name="maintenance-poll", daemon=True).start()


class MaintenanceMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware), so the off path is one function
    call and a global read."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if enabled and scope["type"] == "http" and scope["path"] not in EXEMPT_PATHS:
            response = JSONResponse(
                {"detail": "Districtr is down for maintenance. Please try again soon."},
                status_code=503,
                headers={"Retry-After": "300"},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
