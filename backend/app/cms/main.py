from fastapi import APIRouter, Depends, HTTPException, status, Query, Security
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError, NoResultFound
from sqlalchemy.sql import func as db_func
from datetime import datetime
import logging
from typing import Annotated
from psycopg.errors import UniqueViolation
from app.core.security import auth, TokenScope
from app.core.db import get_session
from app.cms.models import (
    CMSContentCreate,
    LanguageEnum,
    CmsContentUpdate,
    CMS_MODEL_MAP,
    CMSContentTypesEnum,
    ContentUpdateResponse,
    CmsContent,
    LANGUAGE_MAP,
)
from app.cms.utils import content_update

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
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
):
    """Create a new CMS content entry"""
    CmsModel: CmsContent = CMS_MODEL_MAP[data.content_type]

    try:
        timestamp = datetime.now()
        content = CmsModel(
            id=db_func.gen_random_uuid(),
            created_at=timestamp,
            updated_at=timestamp,
            author=auth_result["sub"],
            **data.model_dump(),
        )
        session.add(content)
        session.commit()
        session.refresh(content)
    except (IntegrityError, UniqueViolation):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Content with slug '{data.slug}' and language '{LANGUAGE_MAP[data.language.value]}' already exists",
        )

    return {
        "id": content.id,
        "message": "Content created successfully",
    }


@router.patch("/content", response_model=ContentUpdateResponse)
async def update_cms_content(
    data: CmsContentUpdate,
    content: Annotated[CmsContent, Depends(content_update)],
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.update_content]),
):
    """Update existing CMS content"""
    can_update_all = TokenScope.update_all_content in (auth_result.get("scope") or [])
    CMSContent = CMS_MODEL_MAP[data.content_type]
    # fetch existing content
    stmt = select(CMSContent).where(
        CMSContent.id == data.content_id,
        (CMSContent.author == auth_result["sub"]) | can_update_all,
    )
    existing_content = session.exec(stmt).one_or_none()

    if not existing_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found",
        )

    try:
        update_data = data.updates.model_dump(exclude_unset=True)
        content.sqlmodel_update(update_data)
        session.add(content)
        session.commit()
        session.refresh(content)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Content with slug '{data.updates.slug}' and language '{data.updates.language}' already exists",
        )

    return {"id": content.id, "message": "Content updated successfully"}


@router.post("/content/publish", response_model=ContentUpdateResponse)
async def publish_cms_content(
    content: Annotated[CmsContent, Depends(content_update)],
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.publish_content]),
):
    """Publish draft content"""
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


@router.delete(
    "/content/{content_type}/{content_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_cms_content(
    content_type: CMSContentTypesEnum,
    content_id: str,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.delete_content]),
):
    """Delete CMS content by ID"""
    CMSContent = CMS_MODEL_MAP[content_type]
    can_delete_all = TokenScope.delete_all_content in (auth_result.get("scope") or [])
    stmt = select(CMSContent).where(
        CMSContent.id == content_id,
        (CMSContent.author == auth_result["sub"]) | can_delete_all,
    )
    try:
        content = session.execute(stmt).scalar_one()
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not found",
        )

    session.delete(content)
    session.commit()

    return None


@router.get("/content/{content_type}/list")
async def list_cms_content(
    content_type: CMSContentTypesEnum,
    language: LanguageEnum | None = None,
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
    author: str | None = Query(default=None),
):
    """List CMS content with optional filtering"""
    CMSModel = CMS_MODEL_MAP[content_type]
    query = select(CMSModel)

    if language is not None:
        logger.info(f"Filtering by language: {language}")
        query = query.where(CMSModel.language == language)

    if author is not None:
        logger.info("filtering by author")
        query = query.where(CMSModel.auth == author)

    query = query.offset(offset).limit(limit)
    results = session.exec(query).all()
    return results


@router.get("/content/{content_type}/list/authored")
async def list_editor_cms_content(
    content_type: CMSContentTypesEnum,
    language: LanguageEnum | None = None,
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.read_content]),
):
    """List CMS content with optional filtering"""
    can_read_all = TokenScope.read_all_content in (auth_result.get("scope") or [])
    logger.info("AUTHORIZED auth_result", can_read_all)
    CMSModel = CMS_MODEL_MAP[content_type]
    author = auth_result["sub"]

    query = select(CMSModel)
    if not can_read_all:
        query = query.where(CMSModel.author == author)

    if language is not None:
        logger.info(f"Filtering by language: {language}")
        query = query.where(CMSModel.language == language)

    query = query.offset(offset).limit(limit)
    results = session.exec(query).all()
    return results


@router.get(
    "/content/{content_type}/slug/{slug}",
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
