from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlmodel import Session
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import text
import logging

from app.core.db import get_session
from app.comments.models import (
    Commenter,
    CommenterCreate,
    CommenterPublic,
    Comment,
    CommentCreate,
    CommentPublic,
    Tag,
    TagCreate,
    TagPublic,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

router = APIRouter(tags=["comments"], prefix="/api/comments")


def create_commenter_db(commenter_data: CommenterCreate, session: Session) -> Commenter:
    """
    Create a new commenter with upsert on conflict for name + email unique constraint.
    Returns the Commenter model with id.
    """
    stmt = insert(Commenter).values(**commenter_data.model_dump())
    stmt = stmt.on_conflict_do_update(
        constraint="commenter_unique_on_first_name_and_email",
        set_={
            "salutation": stmt.excluded.salutation,
            "last_name": stmt.excluded.last_name,
            "place": stmt.excluded.place,
            "state": stmt.excluded.state,
            "zip_code": stmt.excluded.zip_code,
            "updated_at": stmt.excluded.updated_at,
        },
    ).returning(Commenter)

    result = session.execute(stmt)
    commenter = result.scalar_one()
    session.commit()
    return commenter


def create_comment_db(comment_data: CommentCreate, session: Session) -> Comment:
    """
    Create a new comment without commenter foreign key.
    Returns the Comment model with id.
    """
    comment = Comment(**comment_data.model_dump())
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment


def create_tag_db(tag_data: TagCreate, session: Session) -> Tag:
    """
    Create a new tag using the slugify_tag SQL function.
    Returns the Tag model with id.
    """
    # Single query that always returns a tag (new or existing)
    stmt = insert(Tag).values(slug=text("slugify_tag(:tag)"))
    stmt = stmt.on_conflict_do_update(
        index_elements=["slug"],
        set_=dict(slug=stmt.excluded.slug),  # No-op update
    ).returning(Tag)

    result = session.execute(stmt, {"tag": tag_data.tag})
    tag = result.scalar_one()
    session.commit()

    return tag


@router.post(
    "/commenter", response_model=CommenterPublic, status_code=status.HTTP_201_CREATED
)
async def create_commenter(
    commenter_data: CommenterCreate, session: Session = Depends(get_session)
):
    """Create a new commenter with upsert on conflict for name + email."""
    try:
        commenter = create_commenter_db(commenter_data, session)
    except IntegrityError as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return commenter


@router.post(
    "/comment", response_model=CommentPublic, status_code=status.HTTP_201_CREATED
)
async def create_comment(
    comment_data: CommentCreate, session: Session = Depends(get_session)
):
    """Create a new comment without commenter foreign key."""
    try:
        comment = create_comment_db(comment_data, session)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return comment


@router.post("/tag", response_model=TagPublic, status_code=status.HTTP_201_CREATED)
async def create_tag(tag_data: TagCreate, session: Session = Depends(get_session)):
    """Create a new tag using the slugify_tag SQL function."""
    try:
        tag = create_tag_db(tag_data, session)
    except IntegrityError as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return tag
