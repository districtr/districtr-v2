import re
from datetime import datetime
from typing import Any, Dict
from pydantic import UUID4, BaseModel, field_validator
from sqlmodel import (
    Field,
    SQLModel,
    UniqueConstraint,
    Column,
    MetaData,
    String,
)
from sqlalchemy.types import ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from enum import Enum
from app.models import TimeStampMixin, UUIDType
from app.constants import CMS_SCHEMA


class LanguageEnum(str, Enum):
    ENGLISH = "en"
    SPANISH = "es"
    CHINESE = "zh"
    VIETNAMESE = "vi"
    HAITIAN = "ht"
    PORTUGUESE = "pt"


LANGUAGE_MAP = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese",
    "vi": "Vietnamese",
    "ht": "Haitian",
    "pt": "Portuguese",
}


class TagsCMSContent(TimeStampMixin, SQLModel, table=True):
    __tablename__ = "tags_content"
    metadata = MetaData(schema=CMS_SCHEMA)
    id: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    slug: str = Field(nullable=False, index=True)
    language: LanguageEnum = Field(
        default=LanguageEnum.ENGLISH, nullable=False, index=True
    )
    draft_content: Dict[str, Any] | None = Field(sa_column=Column(JSONB, nullable=True))
    published_content: Dict[str, Any] | None = Field(
        sa_column=Column(JSONB, nullable=True)
    )
    districtr_map_slug: str | None = Field(
        sa_column=Column(
            String,
            nullable=True,
            index=True,
        )
    )
    author: str | None = Field(sa_column=Column(String, nullable=True))
    __table_args__ = (
        UniqueConstraint("slug", "language", name="tags_slug_language_unique"),
    )


class PlacesCMSContent(TimeStampMixin, SQLModel, table=True):
    __tablename__ = "places_content"
    metadata = MetaData(schema=CMS_SCHEMA)
    id: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    slug: str = Field(nullable=False, index=True)
    language: LanguageEnum = Field(
        default=LanguageEnum.ENGLISH, nullable=False, index=True
    )
    draft_content: Dict[str, Any] | None = Field(sa_column=Column(JSONB, nullable=True))
    published_content: Dict[str, Any] | None = Field(
        sa_column=Column(JSONB, nullable=True)
    )
    districtr_map_slugs: list[str] | None = Field(
        sa_column=Column(
            ARRAY(String),
            nullable=True,
            index=True,
        )
    )
    author: str | None = Field(sa_column=Column(String, nullable=True))
    __table_args__ = (
        UniqueConstraint("slug", "language", name="places_slug_language_unique"),
    )


class GroupsCMSContent(TimeStampMixin, SQLModel, table=True):
    __tablename__ = "groups_content"
    metadata = MetaData(schema=CMS_SCHEMA)
    id: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    slug: str = Field(nullable=False, index=True)
    language: LanguageEnum = Field(
        default=LanguageEnum.ENGLISH, nullable=False, index=True
    )
    draft_content: Dict[str, Any] | None = Field(sa_column=Column(JSONB, nullable=True))
    published_content: Dict[str, Any] | None = Field(
        sa_column=Column(JSONB, nullable=True)
    )
    group_slugs: list[str] | None = Field(
        sa_column=Column(
            ARRAY(String),
            nullable=True,
            index=True,
        )
    )
    author: str | None = Field(sa_column=Column(String, nullable=True))
    __table_args__ = (
        UniqueConstraint("slug", "language", name="groups_slug_language_unique"),
    )


class CMSContentTypesEnum(str, Enum):
    tags = "tags"
    places = "places"
    groups = "groups"


CMS_MODEL_MAP = {
    CMSContentTypesEnum.tags: TagsCMSContent,
    CMSContentTypesEnum.places: PlacesCMSContent,
    CMSContentTypesEnum.groups: GroupsCMSContent,
}


CmsContent = PlacesCMSContent | TagsCMSContent | GroupsCMSContent


class CMSContentCreate(BaseModel):
    content_type: CMSContentTypesEnum
    slug: str
    language: LanguageEnum = LanguageEnum.ENGLISH
    draft_content: Dict[str, Any] | None = None
    published_content: Dict[str, Any] | None = None
    districtr_map_slug: str | None = None
    districtr_map_slugs: list[str] | None = None
    group_slugs: list[str] | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value):
        pattern = r"^[a-z0-9-]+$"
        if not re.match(pattern, value):
            raise ValueError("Invalid slug")
        return value


class CMSContentPublish(BaseModel):
    content_type: CMSContentTypesEnum
    content_id: UUID4


class CmsContentUpdateFields(BaseModel):
    slug: str | None = None
    language: LanguageEnum | None = None
    draft_content: Dict[str, Any] | None = None
    published_content: Dict[str, Any] | None = None
    districtr_map_slug: str | None = None
    districtr_map_slugs: list[str] | None = None
    group_slugs: list[str] | None = None


class CmsContentUpdate(BaseModel):
    content_type: CMSContentTypesEnum
    content_id: UUID4
    updates: CmsContentUpdateFields


class BaseCMSContentPublic(BaseModel):
    id: UUID4
    slug: str
    language: LanguageEnum
    draft_content: Dict[str, Any] | None = None
    published_content: Dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class TagsCMSContentPublic(BaseCMSContentPublic):
    districtr_map_slug: str | None = None


class PlacesCMSContentPublic(BaseCMSContentPublic):
    districtr_map_slugs: list[str] | None = None


class GroupsCMSContentPublic(BaseCMSContentPublic):
    group_slugs: list[str] | None = None


AllCMSContentPublic = (
    TagsCMSContentPublic | PlacesCMSContentPublic | GroupsCMSContentPublic
)


class ContentUpdateResponse(BaseModel):
    id: UUID4
    message: str


class AllCmsFields(BaseCMSContentPublic):
    districtr_map_slug: str | None = None
    districtr_map_slugs: list[str] | None = None
    group_slugs: list[str] | None = None


class CMSContentPublicWithLanguages(BaseModel):
    content: AllCmsFields
    available_languages: list[LanguageEnum]
    type: CMSContentTypesEnum


CmsContentCRUD = CmsContentUpdate | CMSContentPublish
