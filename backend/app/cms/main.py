from fastapi import APIRouter, Depends, Security
from sqlmodel import Session

import app.maintenance as maintenance
from app.core.db import get_session
from app.core.security import TokenScope, auth
from app.cms.models import SiteSettings, SiteSettingsUpdate

router = APIRouter(prefix="/api/cms", tags=["cms"])


def _public(settings: SiteSettings | None) -> dict:
    return {
        "under_construction": bool(settings and settings.under_construction),
        "banner_message": settings.banner_message if settings else None,
    }


@router.get("/site_settings")
def get_site_settings(session: Session = Depends(get_session)):
    """Get site-wide settings (public)"""
    return _public(session.get(SiteSettings, 1))


@router.patch("/site_settings")
def update_site_settings(
    data: SiteSettingsUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.update_all_content]),
):
    """Update site-wide settings (admin only)"""
    settings = session.get(SiteSettings, 1) or SiteSettings(id=1)
    settings.under_construction = data.under_construction
    settings.banner_message = data.banner_message
    session.add(settings)
    session.commit()
    # This process flips now; the others on their next poll.
    maintenance.enabled = settings.under_construction
    return _public(settings)
