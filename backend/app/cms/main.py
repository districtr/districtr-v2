from fastapi import APIRouter, Depends, Security
from sqlmodel import Session

import app.maintenance as maintenance
from app.core.db import get_session
from app.core.security import TokenScope, auth
from app.cms.models import SiteSettings, SiteSettingsUpdate

# Every route here is reachable during maintenance only if it's listed in
# app/maintenance.py EXEMPT_PATHS.
router = APIRouter(prefix="/api/cms", tags=["cms"])


def _public(under_construction, banner_message, downtime_at, feature_flags) -> dict:
    return {
        "under_construction": under_construction,
        "banner_message": banner_message,
        "downtime_at": downtime_at,
        "feature_flags": feature_flags or {},
    }


@router.get("/site_settings")
def get_site_settings(fresh: bool = False, session: Session = Depends(get_session)):
    """Get site-wide settings (public).

    Served from this worker's poller snapshot (app/maintenance.py), so open
    tabs polling it cost no DB work and it keeps answering while the DB is
    down. `fresh=true` reads the row instead, for the CMS form, which reads
    right after a save that may have landed on another worker.
    """
    if maintenance.loaded and not fresh:
        return _public(
            maintenance.enabled,
            maintenance.banner_message,
            maintenance.downtime_at,
            maintenance.feature_flags,
        )
    settings = session.get(SiteSettings, 1)
    if settings is None:
        return _public(False, None, None)
    return _public(
        settings.under_construction,
        settings.banner_message,
        settings.downtime_at,
        settings.feature_flags,
    )


@router.patch("/site_settings")
def update_site_settings(
    data: SiteSettingsUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.update_all_content]),
):
    """Update site-wide settings (admin only). Only the fields sent change."""
    settings = session.get(SiteSettings, 1) or SiteSettings(id=1)
    for field in data.model_fields_set:
        value = getattr(data, field)
        if field in ("under_construction", "feature_flags") and value is None:
            continue  # NOT NULL column: null means "leave as is"
        setattr(settings, field, value)
    if settings.under_construction:
        settings.downtime_at = None  # the countdown is over
    session.add(settings)
    session.commit()
    # This worker flips now; the others on their next poll.
    state = (
        settings.under_construction,
        settings.banner_message,
        settings.downtime_at,
        settings.feature_flags,
    )
    maintenance.set_state(*state)
    return _public(*state)
