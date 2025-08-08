from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlmodel import Session, select, desc, func
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import text
import logging

from app.core.dependencies import get_protected_document
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
    DocumentComment,
    PublicCommentListing,
)
from app.core.models import DocumentID

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

    if comment_data.document_id is not None:
        create_document_comment(
            comment_id=comment.id,
            document_id=comment_data.document_id,
            session=session,
        )

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


def create_document_comment(
    comment_id: int, document_id: str, session: Session
) -> None:
    """
    Create a document comment.
    """
    document = get_protected_document(
        document_id=DocumentID(document_id=document_id), session=session
    )

    stmt = insert(DocumentComment).values(
        comment_id=comment_id, document_id=document.document_id
    )
    session.execute(stmt)
    session.commit()


def create_full_comment_submission(
    form_data: FullCommentForm, session: Session
) -> FullCommentFormResponse:
    """
    Create a complete comment submission with commenter, comment, tags, and associations.

    TODO: This function would have a better interface for the client if it aggregated
    all errors rather than failing on the first thing.
    """
    commenter = create_commenter_db(form_data.commenter, session)

    form_data.comment.commenter_id = commenter.id
    comment = create_comment_db(form_data.comment, session)

    # TODO: Do this as a batch upsert
    created_tags = []
    tag_ids = []
    for tag_create in form_data.tags:
        tag = create_tag_db(tag_create, session)
        created_tags.append(tag)
        tag_ids.append(tag.id)

    create_comment_tag_associations(comment.id, tag_ids, session)

    session.commit()
    session.refresh(comment)

    response = FullCommentFormResponse(
        comment=CommentPublic(**comment.model_dump()),
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


@router.get(
    "/doc/{document_id}",
    response_model=list[PublicCommentListing],
)
async def list_comments_by_doc(
    *,
    session: Session = Depends(get_session),
    document_id: str,
):
    query = (
        select(Comment, func.array_agg(Tag.slug).label("tags"))
        .join(DocumentComment, Comment.id == DocumentComment.comment_id)
        # .join(Commenter, Comment.commenter_id == Commenter.id)
        .join(CommentTag, Comment.id == CommentTag.comment_id)
        .join(Tag, CommentTag.tag_id == Tag.id)
        .where(DocumentComment.document_id == document_id)
        .group_by(Comment.id)
        .order_by(desc(Comment.created_at))
    )
    results = session.exec(query)
    rows = results.all()
    return [{"comment": comment, "tags": tags} for comment, tags in rows]


@router.get(
    "/tagged/{tag}",
    response_model=list[Comment],
)
async def list_comments_by_tag(
    *,
    session: Session = Depends(get_session),
    tag: str,
):
    query = (
        select(Comment)
        .join(CommentTag, Comment.id == CommentTag.comment_id)
        .join(Tag, CommentTag.tag_id == Tag.id)
        .where(Tag.slug == tag)
        .order_by(desc(Comment.created_at))
    )
    comments = session.exec(query)
    return comments.all()
