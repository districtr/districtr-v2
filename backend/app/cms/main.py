import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select
from datetime import datetime
import logging

from app.core.db import get_session
from app.cms.models import (
    CMSContentCreate,
    CmsContentUpdate,
    CMSContentPublish,
    CMSContentDelete,
    LanguageEnum,
    CMS_MODEL_MAP,
    CMSContentTypesEnum,
    AllCMSContentPublic,
    ContentUpdateResponse,
    LANGUAGE_MAP,
)

router = APIRouter(prefix="/api/cms", tags=["cms"])
logger = logging.getLogger(__name__)


@router.post(
    "/content",
    response_model=ContentUpdateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_cms_content(
    data: CMSContentCreate,
    session: Session = Depends(get_session),
):
    """Create a new CMS content entry"""
    # Check if content with same slug and language already exists
    CmsModel = CMS_MODEL_MAP[data.content_type]

    existing = session.exec(
        select(CmsModel)
        .where(CmsModel.slug == data.slug)
        .where(CmsModel.language == data.language)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Content with slug '{data.slug}' and language '{LANGUAGE_MAP[data.language.value]}' already exists",
        )
    timestamp = datetime.now()
    content = CmsModel(
        id=str(uuid.uuid4()),
        created_at=timestamp,
        updated_at=timestamp,
        **data.model_dump(),
    )
    session.add(content)
    session.commit()
    session.refresh(content)

    return {
        "id": content.id,
        "message": "Content created successfully",
    }


@router.patch("/content", response_model=ContentUpdateResponse)
async def update_cms_content(
    data: CmsContentUpdate,
    session: Session = Depends(get_session),
):
    """Update existing CMS content"""
    CMSModel = CMS_MODEL_MAP[data.content_type]
    # Check if content exists
    content = session.exec(
        select(CMSModel).where(CMSModel.id == data.content_id)
    ).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{data.content_id}' not found",
        )

    # If updating slug or language, check for conflicts
    if (data.updates.slug and data.updates.slug != content.slug) or (
        data.updates.language and data.updates.language != content.language
    ):
        new_slug = data.updates.slug or content.slug
        new_language = data.updates.language or content.language

        conflict = session.exec(
            select(CMSModel)
            .where(CMSModel.slug == new_slug)
            .where(CMSModel.language == new_language)
            .where(CMSModel.id != data.content_id)
        ).first()

        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Content with slug '{new_slug}' and language '{new_language}' already exists",
            )

    # Update content
    update_data = data.updates.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(content, key, value)

    session.add(content)
    session.commit()
    session.refresh(content)

    return {"id": content.id, "message": "Content updated successfully"}


@router.post("/content/publish", response_model=ContentUpdateResponse)
async def publish_cms_content(
    data: CMSContentPublish, session: Session = Depends(get_session)
):
    """Publish draft content"""
    CMSModel = CMS_MODEL_MAP[data.content_type]
    content = session.exec(
        select(CMSModel).where(CMSModel.id == data.content_id)
    ).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{data.content_id}' not found",
        )

    if not content.draft_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No draft content to publish",
        )

    content.published_content = content.draft_content
    content.draft_content = None
    session.add(content)
    session.commit()
    session.refresh(content)

    return {"id": content.id, "message": "Content published successfully"}


@router.post("/content/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cms_content(
    data: CMSContentDelete, session: Session = Depends(get_session)
):
    """Delete CMS content by ID"""
    CMSModel = CMS_MODEL_MAP[data.content_type]
    content = session.exec(
        select(CMSModel).where(CMSModel.id == data.content_id)
    ).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{data.content_id}' not found",
        )

    session.delete(content)
    session.commit()

    return None


@router.get("/content/{content_type}/list", response_model=list[AllCMSContentPublic])
async def list_cms_content(
    content_type: CMSContentTypesEnum,
    language: LanguageEnum = None,
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=100),
):
    """List CMS content with optional filtering"""
    CMSModel = CMS_MODEL_MAP[content_type]
    query = select(CMSModel)
    if language:
        logger.info(f"Filtering by language: {language}")
        query = query.where(CMSModel.language == language)
    query = query.offset(offset).limit(limit)
    results = session.exec(query).all()
    return results


@router.get(
    "/content/{content_type}/slug/{slug}",
    #  response_model=CMSContentPublicWithLanguages
)
async def get_cms_content(
    content_type: CMSContentTypesEnum,
    slug: str,
    language: LanguageEnum = LanguageEnum.ENGLISH,
    session: Session = Depends(get_session),
):
    """Get CMS content by slug and language"""
    CmsModel = CMS_MODEL_MAP[content_type]

    content = session.exec(select(CmsModel).where(CmsModel.slug == slug)).all()
    languages = [row.language for row in content]
    preferred_language = language if language in languages else "en"
    preferred_content = next(
        (row for row in content if row.language == preferred_language), None
    )
    if not preferred_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with slug '{slug}' and language '{language}' not found",
        )

    return {
        "available_languages": languages,
        "type": content_type,
        "content": preferred_content,
    }
