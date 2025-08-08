from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    BackgroundTasks,
    Query,
    Security,
)
from sqlmodel import Session
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import func, select, text
from app.core.security import auth, TokenScope
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
    PublicCommentResponse,
)
from app.comments.moderation import moderate_submission
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
    form_data: FullCommentForm, session: Session, background_tasks: BackgroundTasks
) -> FullCommentFormResponse:
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
    created_tags = []
    tag_ids = []
    for tag_create in form_data.tags:
        tag = create_tag_db(tag_create, session)
        created_tags.append(tag)
        tag_ids.append(tag.id)

    create_comment_tag_associations(comment.id, tag_ids, session)

    session.commit()
    session.refresh(comment)

    # Add moderation check as background task
    background_tasks.add_task(
        moderate_submission,
        comment_id=comment.id,
        commenter_id=commenter.id,
        tag_ids=tag_ids,
        form_data=form_data,
        session=session,
    )

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
    form_data: FullCommentForm,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Submit a complete comment with commenter, comment, and tags."""
    try:
        response = create_full_comment_submission(form_data, session, background_tasks)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    return response


def query_comments(
    session: Session, tags: list[str], place: str, state: str, zip_code: str
):
    """
    Query the comments table with the given filters.
    """
    stmt = (
        select(
            Comment,
            func.array_agg(Tag.slug).label("tags"),
            Commenter.first_name,
            Commenter.place,
            Commenter.state,
            Commenter.zip_code,
            DocumentComment.document_id,
            func.max(func.coalesce(Tag.moderation_score, 0)).label("max_tag_score"),
            Comment.moderation_score.label("comment_score"),
            Commenter.moderation_score.label("commenter_score"),
        )
        .join(Commenter, Comment.commenter_id == Commenter.id)
        .join(DocumentComment, Comment.id == DocumentComment.comment_id)
        .join(CommentTag, Comment.id == CommentTag.comment_id)
        .join(Tag, Tag.id == CommentTag.tag_id)
        .group_by(Comment.id, Commenter.id, DocumentComment.document_id)
    )

    if tags:
        stmt = stmt.where(Tag.slug.in_(tags))
    if place:
        stmt = stmt.where(Commenter.place == place)
    if state:
        stmt = stmt.where(Commenter.state == state)
    if zip_code:
        stmt = stmt.where(Commenter.zip_code == zip_code)

    return stmt


def format_comments(results: list[tuple]) -> list[PublicCommentResponse]:
    """
    Format the results of the query into a list of PublicCommentResponse objects.
    """
    response = []

    for row in results:
        (
            comment,
            tags,
            first_name,
            place,
            state,
            zip_code,
            document_id,
            max_tag_score,
            comment_score,
            commenter_score,
        ) = row

        # Compute max moderation score safely
        max_moderation_score = max(
            [
                score
                for score in [max_tag_score, comment_score, commenter_score]
                if score is not None
            ],
            default=None,
        )

        response.append(
            PublicCommentResponse(
                id=comment.id,
                title=comment.title,
                comment=comment.comment,
                name=f"{first_name}",
                created_at=comment.created_at,
                updated_at=comment.updated_at,
                place=place,
                state=state,
                zip_code=zip_code,
                tags=tags,
                document_id=document_id,
                moderation_score=max_moderation_score,
            )
        )

    return response


@router.get("/list", response_model=list[PublicCommentResponse])
async def list_comments(
    session: Session = Depends(get_session),
    # query params tags, place, state, zip_code
    tags: list[str] = Query(default=[]),
    place: str = Query(default=None),
    state: str = Query(default=None),
    zip_code: str = Query(default=None),
):
    """List all comments."""
    stmt = query_comments(session, tags, place, state, zip_code)

    # TODO: fix this
    # threshold = get_settings().MODERATION_THRESHOLD
    # stmt = stmt.where(Comment.moderation_score < threshold)\
    #     .where(Commenter.moderation_score < threshold)\
    #     .where(Tag.moderation_score < threshold)

    results = session.exec(stmt).all()
    return format_comments(results)


@router.get("/admin/list", response_model=list[PublicCommentResponse])
async def list_comments_admin(
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
    tags: list[str] = Query(default=[]),
    place: str = Query(default=None),
    state: str = Query(default=None),
    zip_code: str = Query(default=None),
    min_moderation_score: float = Query(default=0.0),
):
    """List all comments."""
    stmt = query_comments(session, tags, place, state, zip_code)

    # TODO: fix this
    # stmt = stmt.where(
    #     or_(
    #         Comment.moderation_score >= min_moderation_score,
    #         Commenter.moderation_score >= min_moderation_score,
    #         Tag.moderation_score >= min_moderation_score
    #     )
    # )

    results = session.exec(stmt).all()
    return format_comments(results)
