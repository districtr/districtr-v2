"""Site-wide settings.

Content models (tags/places) moved to the Wagtail CMS; the legacy
`cms.tags_content` / `cms.places_content` tables stay in the DB until a month
after cutover (migrate_tiptap reads them) but are no longer mapped here.
"""

from pydantic import BaseModel, Field as PydanticField, field_validator
from sqlmodel import Field, MetaData
from app.core.models import SQLModel
from app.constants import CMS_SCHEMA

BANNER_MESSAGE_MAX_LENGTH = 500


class SiteSettings(SQLModel, table=True):
    __tablename__ = "site_settings"
    metadata = MetaData(schema=CMS_SCHEMA)
    id: int = Field(default=1, primary_key=True)
    # Maintenance mode: the frontend redirects to /under-construction and the
    # API answers 503 (app/maintenance.py).
    under_construction: bool = Field(default=False, nullable=False)
    # Shown site-wide by the frontend's SiteBanner; null hides it.
    banner_message: str | None = Field(default=None)


class SiteSettingsUpdate(BaseModel):
    under_construction: bool
    banner_message: str | None = PydanticField(
        default=None, max_length=BANNER_MESSAGE_MAX_LENGTH
    )

    @field_validator("banner_message")
    @classmethod
    def blank_is_none(cls, value: str | None) -> str | None:
        return (value or "").strip() or None
