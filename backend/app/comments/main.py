from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Request,
)
from sqlmodel import Session, select, desc, func
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import any_, text
import logging
from typing import Optional

from app.core.dependencies import get_protected_document
from app.core.db import get_session
from app.comments.models import (
    Commenter,
    CommenterCreate,
    CommenterCreateWithRecaptcha,
    CommenterPublic,
    Comment,
    CommentCreate,
    CommentCreateWithRecaptcha,
    CommentPublic,
    Tag,
    TagCreate,
    TagCreateWithRecaptcha,
    TagPublic,
    CommentTag,
    FullCommentForm,
    FullCommentFormResponse,
    DocumentComment,
    PublicCommentListing,
)
from app.core.models import DocumentID
from app.core.security import recaptcha

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
    # if comment is submitted with a document ID, get the document ID
    if "document_id" in comment_data and comment_data.document_id is not None:
        try:
            document = get_protected_document(
                document_id=DocumentID(document_id=comment_data.document_id),
                session=session,
            )
            document_id = document.document_id
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Document ID {comment_data.document_id} not found",
            )
    else:
        document_id = None

    kwargs = {
        **comment_data.model_dump(),
        "document_id": document_id,
    }

    comment = Comment(**kwargs)
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
    request: Request,
    commenter_data: CommenterCreateWithRecaptcha,
    session: Session = Depends(get_session),
):
    """Create a new commenter with upsert on conflict for name + email."""
    await recaptcha.verify_recaptcha(
        commenter_data.recaptcha_token, request.client.host
    )
    try:
        commenter = create_commenter_db(commenter_data.commenter, session)
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
    request: Request,
    comment_data: CommentCreateWithRecaptcha,
    session: Session = Depends(get_session),
):
    """Create a new comment without commenter foreign key."""
    await recaptcha.verify_recaptcha(comment_data.recaptcha_token, request.client.host)
    try:
        comment = create_comment_db(comment_data.comment, session)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return comment


@router.post("/tag", response_model=TagPublic, status_code=status.HTTP_201_CREATED)
async def create_tag(
    request: Request,
    tag_data: TagCreateWithRecaptcha,
    session: Session = Depends(get_session),
):
    """Create a new tag using the slugify_tag SQL function."""
    await recaptcha.verify_recaptcha(tag_data.recaptcha_token, request.client.host)
    try:
        tag = create_tag_db(tag_data.tag, session)
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
    request: Request,
    form_data: FullCommentForm,
    session: Session = Depends(get_session),
):
    """Submit a complete comment with commenter, comment, and tags."""
    await recaptcha.verify_recaptcha(form_data.recaptcha_token, request.client.host)
    try:
        response = create_full_comment_submission(form_data, session)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return response


@router.get(
    "/list",
    response_model=list[PublicCommentListing],
)
async def list_comments(
    *,
    session: Session = Depends(get_session),
    document_id: Optional[str] = None,
    tag: Optional[str] = None,
):
    if not document_id and not tag:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You must provide either document_id or tag.",
        )

    # .join(Commenter, Comment.commenter_id == Commenter.id)
    query = (
        select(
            Comment,
            func.array_agg(Tag.slug).filter(Tag.slug is not None).label("tags"),
        )
        .join(DocumentComment, Comment.id == DocumentComment.comment_id)
        .outerjoin(CommentTag, Comment.id == CommentTag.comment_id)
        .outerjoin(Tag, CommentTag.tag_id == Tag.id)
        .group_by(Comment.id)
        .order_by(desc(Comment.created_at))
    )
    if document_id:
        query = query.where(DocumentComment.document_id == document_id)
    if tag:
        query = query.having(tag == any_(func.array_agg(Tag.slug)))

    results = session.exec(query)
    rows = results.all()
    return [
        {
            "comment": comment,
            "tags": [] if not tags or all(t is None for t in tags) else tags,
        }
        for comment, tags in rows
    ]
