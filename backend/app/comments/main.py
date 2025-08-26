from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    BackgroundTasks,
    Security,
    Query,
    Request,
)
from sqlmodel import Session, select, func
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import text, or_

from app.core.security import auth, TokenScope
from typing import Optional

from app.core.dependencies import get_protected_document
from app.core.db import get_session
from app.comments.models import (
    Commenter,
    CommenterCreateWithRecaptcha,
    CommenterPublic,
    Comment,
    CommentCreate,
    CommentCreateWithRecaptcha,
    CommentPublic,
    Tag,
    TagWithId,
    TagCreateWithRecaptcha,
    CommentTag,
    FullCommentForm,
    FullCommentFormResponse,
    DocumentComment,
    FullCommentFormCreate,
    PublicCommentResponse,
    ReviewStatusUpdate,
    ReviewUpdateResponse,
    ReviewStatus,
)
from app.comments.moderation import (
    moderate_submission,
    moderate_commenter,
    moderate_comment,
    moderate_tag,
)
from app.models import Document
from app.core.models import DocumentID
from app.core.security import recaptcha
from app.comments.moderation import MODERATION_THRESHOLD

router = APIRouter(tags=["comments"], prefix="/api/comments")


def create_commenter_db(
    commenter_data: CommenterCreateWithRecaptcha, session: Session
) -> Commenter:
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


def create_tag_db(tag_data: TagCreateWithRecaptcha, session: Session) -> Tag:
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
    form_data: FullCommentFormCreate, session: Session
) -> FullCommentForm:
    """
    Create a complete comment submission with commenter, comment, tags, and associations.
    Adds moderation check as background task.

    TODO: This function would have a better interface for the client if it aggregated
    all errors rather than failing on the first thing.
    """
    commenter = create_commenter_db(form_data.commenter, session)

    form_data.comment.commenter_id = commenter.id
    comment = create_comment_db(form_data.comment, session)

    # TODO: Do this as a batch upsert
    created_tags: list[TagWithId] = []
    for tag_create in form_data.tags:
        tag = create_tag_db(tag_create, session)
        created_tags.append(
            {
                "id": tag.id,
                "slug": tag.slug,
            }
        )
    tag_ids = [tag["id"] for tag in created_tags]

    create_comment_tag_associations(comment.id, tag_ids, session)

    session.commit()
    session.refresh(comment)

    response = FullCommentForm(comment=comment, commenter=commenter, tags=created_tags)

    return response


@router.post(
    "/commenter", response_model=CommenterPublic, status_code=status.HTTP_201_CREATED
)
async def create_commenter(
    commenter_data: CommenterCreateWithRecaptcha,
    background_tasks: BackgroundTasks,
    request: Request,
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

    background_tasks.add_task(moderate_commenter, commenter, session)
    return commenter


@router.post(
    "/comment", response_model=CommentPublic, status_code=status.HTTP_201_CREATED
)
async def create_comment(
    comment_data: CommentCreateWithRecaptcha,
    background_tasks: BackgroundTasks,
    request: Request,
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

    background_tasks.add_task(moderate_comment, comment, session)
    return comment


@router.post("/tag", response_model=TagWithId, status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_data: TagCreateWithRecaptcha,
    background_tasks: BackgroundTasks,
    request: Request,
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

    background_tasks.add_task(moderate_tag, tag, session)
    return tag


@router.post(
    "/submit",
    response_model=FullCommentFormResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_full_comment(
    form_data: FullCommentFormCreate,
    background_tasks: BackgroundTasks,
    request: Request,
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

    background_tasks.add_task(moderate_submission, response, session)
    return response


def get_comments_base_query(
    tags: list[str],
    place: str,
    state: str,
    zip_code: str,
    limit: int,
    offset: int,
    public_id: int,
):
    """
    Query the comments table with the given filters.
    """
    stmt = (
        select(
            Comment.title,
            Comment.comment,
            Commenter.first_name,
            Commenter.last_name,
            Commenter.place,
            Commenter.state,
            Commenter.zip_code,
            func.coalesce(
                func.array_agg(Tag.slug).filter(Tag.slug.isnot(None)), []
            ).label("tags"),
        )
        .outerjoin(Commenter, Comment.commenter_id == Commenter.id)
        .outerjoin(DocumentComment, Comment.id == DocumentComment.comment_id)
        .outerjoin(CommentTag, Comment.id == CommentTag.comment_id)
        .outerjoin(Document, Document.document_id == DocumentComment.document_id)
        .outerjoin(Tag, Tag.id == CommentTag.tag_id)
        .group_by(
            Comment.id, Commenter.id, DocumentComment.document_id, Document.public_id
        )
        .limit(limit)
        .offset(offset)
    )

    if tags:
        # Filter after group by so that any of the tags could be included
        stmt = stmt.having(func.bool_or(Tag.slug.in_(tags)))
    if place:
        stmt = stmt.where(Commenter.place == place)
    if state:
        stmt = stmt.where(Commenter.state == state)
    if zip_code:
        stmt = stmt.where(Commenter.zip_code == zip_code)
    if public_id:
        stmt = stmt.where(Document.public_id == public_id)
    return stmt


@router.get(
    "/list",
    response_model=list[PublicCommentResponse],
)
async def list_comments(
    *,
    session: Session = Depends(get_session),
    public_id: Optional[int] = None,
    tags: Optional[list[str]] = Query(default=None),
    place: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    zip_code: Optional[str] = Query(default=None),
    offset: Optional[int] = Query(default=0, ge=0),
    limit: Optional[int] = Query(default=100, le=100),
):
    stmt = get_comments_base_query(
        tags=tags,
        place=place,
        state=state,
        zip_code=zip_code,
        limit=limit,
        offset=offset,
        public_id=public_id,
    )

    threshold = MODERATION_THRESHOLD
    stmt = (
        stmt.where(
            or_(
                Comment.moderation_score < threshold,
                Comment.review_status == ReviewStatus.APPROVED,
            )
        )
        .where(
            or_(
                Commenter.id == None,  # noqa: E711 SqlAlchemy wants == not is
                Commenter.moderation_score < threshold,
                Commenter.review_status == ReviewStatus.APPROVED,
            )
        )
        .where(
            or_(
                Tag.id == None,  # noqa: E711 SqlAlchemy wants == not is
                Tag.moderation_score < threshold,
                Tag.review_status == ReviewStatus.APPROVED,
            )
        )
    )

    results = session.exec(stmt).all()
    return results


@router.get("/admin/list", response_model=list[PublicCommentResponse])
async def list_comments_admin(
    tags: list[str] = Query(default=[]),
    place: str = Query(default=None),
    state: str = Query(default=None),
    zip_code: str = Query(default=None),
    public_id: int = Query(default=None),
    # View all comments regardless of moderation score
    min_moderation_score: float = Query(default=1.0),
    offset: int = Query(default=0),
    limit: int = Query(default=100),
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
):
    stmt = get_comments_base_query(
        tags=tags,
        place=place,
        state=state,
        zip_code=zip_code,
        limit=limit,
        offset=offset,
        public_id=public_id,
    )

    threshold = min_moderation_score
    stmt = (
        stmt.where(
            or_(
                Comment.moderation_score < threshold,
                Comment.review_status == ReviewStatus.APPROVED,
            )
        )
        .where(
            or_(
                Commenter.moderation_score < threshold,
                Commenter.review_status == ReviewStatus.APPROVED,
                Commenter.id == None,  # noqa: E711 SqlAlchemy wants == not is
            )
        )
        .where(
            or_(
                Tag.id == None,  # noqa: E711 SqlAlchemy wants == not is
                Tag.moderation_score < threshold,
                Tag.review_status == ReviewStatus.APPROVED,
            )
        )
    )
    stmt = stmt.offset(offset).limit(limit)

    results = session.exec(stmt).all()
    return results


@router.post("/admin/review", response_model=ReviewUpdateResponse)
async def review_comment(
    review_data: ReviewStatusUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
):
    model = {
        "comment": Comment,
        "commenter": Commenter,
        "tag": Tag,
    }[review_data.content_type]

    entry = session.get(model, review_data.id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.review_status = review_data.review_status
    session.add(entry)
    session.commit()
    session.refresh(entry)

    return ReviewUpdateResponse(
        message=f"{review_data.content_type} review status updated to {review_data.review_status.value}",
        id=review_data.id,
        new_status=review_data.review_status.value,
    )
