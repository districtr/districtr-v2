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
    CommentTag,
    FullCommentForm,
    FullCommentFormResponse,
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


def create_comment_tag_associations(
    comment_id: int, tag_ids: list[int], session: Session
) -> None:
    """
    Create associations between a comment and multiple tags.
    """
    if not tag_ids:
        return

    associations = [{"comment_id": comment_id, "tag_id": tag_id} for tag_id in tag_ids]

    stmt = insert(CommentTag).values(associations)
    stmt = stmt.on_conflict_do_nothing()
    session.execute(stmt)


def create_full_comment_submission(
    form_data: FullCommentForm, session: Session
) -> FullCommentFormResponse:
    """
    Create a complete comment submission with commenter, comment, tags, and associations.

    TODO: This function would have a better interface for the client if it aggregated
    all errors rather than failing on the first thing.
    """
    commenter = create_commenter_db(form_data.commenter, session)

    comment_data = Comment(
        **form_data.comment.model_dump(exclude_unset=True), commenter_id=commenter.id
    )
    session.add(comment_data)
    session.flush()  # Get the ID without committing

    # TODO: Do this as a batch upsert
    created_tags = []
    tag_ids = []
    for tag_create in form_data.tags:
        tag = create_tag_db(tag_create, session)
        created_tags.append(tag)
        tag_ids.append(tag.id)

    create_comment_tag_associations(comment_data.id, tag_ids, session)

    session.commit()
    session.refresh(comment_data)

    response = FullCommentFormResponse(
        comment=CommentPublic(**comment_data.model_dump()),
        # TODO: for some reason, CommenterPublic wasn't happy with model dump
        # To investigate
        commenter=CommenterPublic(
            first_name=commenter.first_name,
            email=commenter.email,
            salutation=commenter.salutation,
            last_name=commenter.last_name,
            place=commenter.place,
            state=commenter.state,
            zip_code=commenter.zip_code,
            created_at=commenter.created_at,
            updated_at=commenter.updated_at,
        ),
        tags=[TagPublic(slug=tag.slug) for tag in created_tags],
    )

    return response


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


@router.post(
    "/submit",
    response_model=FullCommentFormResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_full_comment(
    form_data: FullCommentForm, session: Session = Depends(get_session)
):
    """Submit a complete comment with commenter, comment, and tags."""
    try:
        response = create_full_comment_submission(form_data, session)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return response
