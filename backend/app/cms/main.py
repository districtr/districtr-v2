import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select
from sqlalchemy.exc import MultipleResultsFound, NoResultFound
from sqlalchemy.sql import literal_column
import logging

from app.core.db import engine
from app.models import (
    CmsContentCreate,
    CmsContentUpdate,
    CMSContentPublicWithLanguages,
    AllCMSContentPublic,
    LanguageEnum,
    CMS_MODEL_MAP,
    CMSContentTypesEnum,
)

router = APIRouter(prefix="/api/cms", tags=["cms"])
logger = logging.getLogger(__name__)


def get_session():
    with Session(engine) as session:
        yield session


@router.post(
    "/content/{type}",
    response_model=CmsContentCreate,
    status_code=status.HTTP_201_CREATED,
)
async def create_cms_content(
    type: CMSContentTypesEnum,
    data: CmsContentCreate,
    session: Session = Depends(get_session),
):
    """Create a new CMS content entry"""
    # Check if content with same slug and language already exists
    CmsModel = CMS_MODEL_MAP[type]
    existing = session.exec(
        select(CmsModel)
        .where(CmsModel.slug == data.slug)
        .where(CmsModel.language == data.language)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Content with slug '{data.slug}' and language '{data.language}' already exists",
        )
    kwargs = {
        "id": str(uuid.uuid4()),
        "slug": data.slug,
        "language": data.language,
        "draft_content": data.draft_content,
        "published_content": data.published_content,
    }
    if type == "tags":
        kwargs["districtr_map_slug"] = data.districtr_map_slug
        content = CmsModel(**kwargs)
    elif type == "places":
        kwargs["distirctr_map_slugs"] = data.distirctr_map_slugs
        content = CmsModel(**kwargs)

    session.add(content)
    session.commit()
    session.refresh(content)

    return content


@router.get(
    "/content/{type}",
    # response_model=list[AllCMSContentPublic]
)
async def list_cms_content(
    type: CMSContentTypesEnum,
    language: LanguageEnum = None,
    districtr_map_slug: str = None,
    districtr_map_slugs: List[str] = None,
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=100),
):
    """List CMS content with optional filtering"""
    CMSModel = CMS_MODEL_MAP[type]
    query = select(CMSModel)

    if language:
        query = query.where(literal_column(CMSModel.language.name) == language)

    # if districtr_map_slug:
    #     query = query.where(
    #         literal_column(CMSModel.districtr_map_slug.name) == districtr_map_slug
    #     )
    # elif districtr_map_slugs:
    #     query = query.where(
    #         literal_column(CMSModel.districtr_map_slugs.name) == districtr_map_slugs
    #     )

    query = query.offset(offset).limit(limit)
    results = session.exec(query).all()

    return results


@router.get("/content/{type}/{slug}", response_model=CMSContentPublicWithLanguages)
async def get_cms_content(
    type: CMSContentTypesEnum,
    slug: str,
    language: LanguageEnum = LanguageEnum.ENGLISH,
    session: Session = Depends(get_session),
):
    """Get CMS content by slug and language"""

    CmsModel = CMS_MODEL_MAP[type]

    try:
        content = session.exec(select(CmsModel).where(CmsModel.slug == slug)).all()
        languages = [row.language for row in content]
        preferred_language = language if language in languages else "en"
        preferred_content = next(
            (row for row in content if row.language == preferred_language), None
        )

        return {
            "available_languages": languages,
            "type": type,
            "content": preferred_content,
        }
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with slug '{slug}' and language '{language}' not found",
        )
    except MultipleResultsFound:
        # This shouldn't happen due to unique constraint, but just in case
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Multiple content entries found for slug '{slug}' and language '{language}'",
        )


@router.put("/content/{type}/{content_id}", response_model=AllCMSContentPublic)
async def update_cms_content(
    type: CMSContentTypesEnum,
    content_id: str,
    data: CmsContentUpdate,
    session: Session = Depends(get_session),
):
    """Update existing CMS content"""
    CMSModel = CMS_MODEL_MAP[type]
    # Check if content exists
    content = session.exec(select(CMSModel).where(CMSModel.id == content_id)).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{content_id}' not found",
        )

    # If updating slug or language, check for conflicts
    if (data.slug and data.slug != content.slug) or (
        data.language and data.language != content.language
    ):
        new_slug = data.slug or content.slug
        new_language = data.language or content.language

        conflict = session.exec(
            select(CMSModel)
            .where(CMSModel.slug == new_slug)
            .where(CMSModel.language == new_language)
            .where(CMSModel.id != content_id)
        ).first()

        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Content with slug '{new_slug}' and language '{new_language}' already exists",
            )

    # Update content
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(content, key, value)

    session.add(content)
    session.commit()
    session.refresh(content)

    return content


@router.delete("/content/{type}/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cms_content(
    content_id: str, type: CMSContentTypesEnum, session: Session = Depends(get_session)
):
    """Delete CMS content by ID"""
    CMSModel = CMS_MODEL_MAP[type]
    content = session.exec(select(CMSModel).where(CMSModel.id == content_id)).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{content_id}' not found",
        )

    session.delete(content)
    session.commit()

    return None


@router.post("/content/{type}/{content_id}/publish", response_model=AllCMSContentPublic)
async def publish_cms_content(
    content_id: str, type: CMSContentTypesEnum, session: Session = Depends(get_session)
):
    """Publish draft content"""
    CMSModel = CMS_MODEL_MAP[type]
    content = session.exec(select(CMSModel).where(CMSModel.id == content_id)).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{content_id}' not found",
        )

    if not content.draft_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No draft content to publish",
        )

    content.published_content = content.draft_content
    session.add(content)
    session.commit()
    session.refresh(content)

    return content
