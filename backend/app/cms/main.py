import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select
from sqlalchemy.exc import MultipleResultsFound, NoResultFound
import logging

from app.core.db import engine
from app.models import (
    CMSContent,
    CMSContentCreate,
    CMSContentUpdate,
    CMSContentPublic,
    LanguageEnum,
)

router = APIRouter(prefix="/api/cms", tags=["cms"])
logger = logging.getLogger(__name__)


def get_session():
    with Session(engine) as session:
        yield session


@router.post(
    "/content", response_model=CMSContentPublic, status_code=status.HTTP_201_CREATED
)
async def create_cms_content(
    data: CMSContentCreate, session: Session = Depends(get_session)
):
    """Create a new CMS content entry"""
    # Check if content with same slug and language already exists
    existing = session.exec(
        select(CMSContent)
        .where(CMSContent.slug == data.slug)
        .where(CMSContent.language == data.language)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Content with slug '{data.slug}' and language '{data.language}' already exists",
        )

    # Create new content entry
    content = CMSContent(
        id=str(uuid.uuid4()),
        slug=data.slug,
        districtr_map_slug=data.districtr_map_slug,
        language=data.language,
        draft_content=data.draft_content,
        published_content=data.published_content,
    )

    session.add(content)
    session.commit()
    session.refresh(content)

    return content


@router.get("/content/{slug}", response_model=CMSContentPublic)
async def get_cms_content(
    slug: str,
    language: LanguageEnum = LanguageEnum.ENGLISH,
    session: Session = Depends(get_session),
):
    """Get CMS content by slug and language"""
    try:
        content = session.exec(
            select(CMSContent)
            .where(CMSContent.slug == slug)
            .where(CMSContent.language == language)
        ).one()
        return content
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


@router.get("/content", response_model=list[CMSContentPublic])
async def list_cms_content(
    language: LanguageEnum = None,
    districtr_map_slug: str = None,
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=100),
):
    """List CMS content with optional filtering"""
    query = select(CMSContent)

    if language:
        query = query.where(CMSContent.language == language)

    if districtr_map_slug:
        query = query.where(CMSContent.districtr_map_slug == districtr_map_slug)

    query = query.offset(offset).limit(limit)
    results = session.exec(query).all()

    return results


@router.put("/content/{content_id}", response_model=CMSContentPublic)
async def update_cms_content(
    content_id: str, data: CMSContentUpdate, session: Session = Depends(get_session)
):
    """Update existing CMS content"""
    # Check if content exists
    content = session.exec(
        select(CMSContent).where(CMSContent.id == content_id)
    ).first()

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
            select(CMSContent)
            .where(CMSContent.slug == new_slug)
            .where(CMSContent.language == new_language)
            .where(CMSContent.id != content_id)
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


@router.delete("/content/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cms_content(content_id: str, session: Session = Depends(get_session)):
    """Delete CMS content by ID"""
    content = session.exec(
        select(CMSContent).where(CMSContent.id == content_id)
    ).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content with ID '{content_id}' not found",
        )

    session.delete(content)
    session.commit()

    return None


@router.post("/content/{content_id}/publish", response_model=CMSContentPublic)
async def publish_cms_content(content_id: str, session: Session = Depends(get_session)):
    """Publish draft content"""
    content = session.exec(
        select(CMSContent).where(CMSContent.id == content_id)
    ).first()

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
