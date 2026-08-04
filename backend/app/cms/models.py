"""Site-wide settings.

Content models (tags/places) moved to the Wagtail CMS; the legacy
`cms.tags_content` / `cms.places_content` tables stay in the DB until a month
after cutover (migrate_tiptap reads them) but are no longer mapped here.
"""

from pydantic import BaseModel
from sqlmodel import Field, MetaData
from app.core.models import SQLModel
from app.constants import CMS_SCHEMA


class SiteSettings(SQLModel, table=True):
    __tablename__ = "site_settings"
    metadata = MetaData(schema=CMS_SCHEMA)
    id: int = Field(default=1, primary_key=True)
    under_construction: bool = Field(default=False, nullable=False)


class SiteSettingsUpdate(BaseModel):
    under_construction: bool
