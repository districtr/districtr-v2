"""Site-wide settings.

Content models (tags/places) moved to the Wagtail CMS; the legacy
`cms.tags_content` / `cms.places_content` tables stay in the DB until a month
after cutover (migrate_tiptap reads them) but are no longer mapped here.
"""

from datetime import datetime

from pydantic import (
    AwareDatetime,
    BaseModel,
    Field as PydanticField,
    StrictBool,
    field_validator,
)
from sqlalchemy import TIMESTAMP, Column
from sqlalchemy.dialects.postgresql import JSONB
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
    # Scheduled downtime start; SiteBanner counts down to it. Cleared when
    # maintenance mode turns on.
    downtime_at: datetime | None = Field(default=None, sa_type=TIMESTAMP(timezone=True))
    # Frontend feature flags, e.g. {"tuningView": false}. A flag left out
    # takes the frontend's default (app/src/app/store/featureFlagStore.ts).
    feature_flags: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )


class SiteSettingsUpdate(BaseModel):
    """Partial update: fields left out of the request stay as they are."""

    under_construction: bool | None = None
    banner_message: str | None = PydanticField(
        default=None, max_length=BANNER_MESSAGE_MAX_LENGTH
    )
    downtime_at: AwareDatetime | None = None
    # Replaces the whole object, so leaving a flag out restores its default.
    # Strict: lax bool would take "off" or "no" as false.
    feature_flags: dict[str, StrictBool] | None = None

    # Before the length check, so a CRLF from the textarea counts as one
    # character (as the browser's maxlength does) and padding doesn't count.
    @field_validator("banner_message", mode="before")
    @classmethod
    def normalize_banner(cls, value):
        if isinstance(value, str):
            return value.replace("\r\n", "\n").strip() or None
        return value
