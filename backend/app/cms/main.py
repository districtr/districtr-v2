from fastapi import APIRouter, Depends, Security
from sqlmodel import Session

from app.core.db import get_session
from app.core.security import TokenScope, auth
from app.cms.models import SiteSettings, SiteSettingsUpdate

router = APIRouter(prefix="/api/cms", tags=["cms"])


@router.get("/site_settings")
async def get_site_settings(session: Session = Depends(get_session)):
    """Get site-wide settings (public)"""
    settings = session.get(SiteSettings, 1)
    return {"under_construction": bool(settings and settings.under_construction)}


@router.patch("/site_settings")
async def update_site_settings(
    data: SiteSettingsUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.update_all_content]),
):
    """Update site-wide settings (admin only)"""
    settings = session.get(SiteSettings, 1) or SiteSettings(id=1)
    settings.under_construction = data.under_construction
    session.add(settings)
    session.commit()
    return {"under_construction": settings.under_construction}
