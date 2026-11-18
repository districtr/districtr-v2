"""Maintenance mode for the API.

While `cms.site_settings.under_construction` is on, every route answers 503
except the ALB health check (`/`, so ECS doesn't cycle the tasks) and
`/api/cms/` (so the frontend can still read the flag and banner, and an admin
can switch it back off).

The flag is a module global refreshed by a daemon thread, so a request pays a
single global read — no DB query, no lock — whether the mode is on or off.
"""

import logging
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
POLL_SECONDS = 15
EXEMPT_PREFIXES = ("/api/cms/",)
QUERY = text(f"SELECT under_construction FROM {CMS_SCHEMA}.site_settings WHERE id = 1")

enabled = False


def _poll() -> None:
    global enabled
    while True:
        try:
            with engine.connect() as conn:
                enabled = bool(conn.execute(QUERY).scalar())
        except Exception as exc:
            # Keep the last value: a DB taken down mid-maintenance stays in
            # maintenance instead of failing open.
            logger.warning("Maintenance flag poll failed: %s", exc)
        time.sleep(POLL_SECONDS)


def start_maintenance_poller() -> None:
    threading.Thread(target=_poll, name="maintenance-poll", daemon=True).start()


class MaintenanceMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware), so the off path is one function
    call and a global read."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            enabled
            and scope["type"] == "http"
            and scope["path"] != "/"
            and not scope["path"].startswith(EXEMPT_PREFIXES)
        ):
            response = JSONResponse(
                {"detail": "Districtr is down for maintenance. Please try again soon."},
                status_code=503,
                headers={"Retry-After": "300"},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
