import time

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from sqlmodel import Session

from app.core.db import get_session
from app.core.security import TokenScope, auth
from app.cms.models import SiteSettings, SiteSettingsUpdate

router = APIRouter(prefix="/api/cms", tags=["cms"])

# How long each process trusts its last read of the under_construction flag.
MAINTENANCE_TTL_SECONDS = 30
_maintenance = {"on": False, "checked_at": float("-inf")}


def reject_writes_under_construction(
    request: Request, session: Session = Depends(get_session)
) -> None:
    """503 for every write while the site is under construction.

    The frontend only redirects page loads, so a tab that is already open keeps
    saving; this is what stops it. Reads still work, and so does the toggle
    itself. Each process re-reads the flag every MAINTENANCE_TTL_SECONDS: after
    switching it on, wait that long before relying on it.
    """
    if (
        request.method in ("GET", "HEAD", "OPTIONS")
        or request.url.path == "/api/cms/site_settings"
    ):
        return
    now = time.monotonic()
    if now - _maintenance["checked_at"] > MAINTENANCE_TTL_SECONDS:
        settings = session.get(SiteSettings, 1)
        _maintenance.update(
            on=bool(settings and settings.under_construction), checked_at=now
        )
    if _maintenance["on"]:
        raise HTTPException(
            status_code=503,
            detail="Districtr is down for maintenance. Please try again in a few minutes.",
            headers={"Retry-After": "120"},
        )


@router.get("/site_settings")
def get_site_settings(session: Session = Depends(get_session)):
    """Get site-wide settings (public)"""
    settings = session.get(SiteSettings, 1)
    return {"under_construction": bool(settings and settings.under_construction)}


@router.patch("/site_settings")
def update_site_settings(
    data: SiteSettingsUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.update_all_content]),
):
    """Update site-wide settings (admin only)"""
    settings = session.get(SiteSettings, 1) or SiteSettings(id=1)
    settings.under_construction = data.under_construction
    session.add(settings)
    session.commit()
    # This process sees the change on its next write; the others within the TTL.
    _maintenance["checked_at"] = float("-inf")
    return {"under_construction": settings.under_construction}
