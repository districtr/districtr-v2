from dataclasses import dataclass

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
from sqlmodel import Session, col
from sqlalchemy.exc import IntegrityError, DataError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import text, func, select, String, Select, update, delete

from app.core.security import auth, TokenScope
from sqlalchemy.sql import or_, and_, exists, literal, cast, case

from app.core.dependencies import get_protected_document, validate_document_exists
from app.core.db import get_session
from app.core.models import DocumentID

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
    TagWithId,
    CommentTag,
    FullCommentForm,
    FullCommentFormResponse,
    DocumentComment,
    FullCommentFormCreate,
    PublicCommentResponse,
    AdminCommentResponse,
    ReviewStatus,
    ReviewStatusUpdate,
    ReviewUpdateResponse,
    CommentFilterParams,
    FlagCommentRequest,
    DistrictCommentInput,
)
from app.comments.moderation import (
    moderate_submission,
    moderate_commenter,
    moderate_comment,
    moderate_comment_by_id,
    moderate_tag,
    MODERATION_THRESHOLD,
)
from app.models import Document, DistrictrMap
from app.core.security import recaptcha

from app.comments.settings import (
    DEFAULT_MAX_COMMENT_LENGTH,
    DEFAULT_MAX_COMMENTS_PER_DISTRICT,
)


def _get_comment_limits_for_document(
    document_id: str, session: Session
) -> tuple[int, int]:
    """Get comment_length_limit and comment_count_limit from the document's DistrictrMap. Uses defaults if null."""
    document = get_protected_document(
        document_id=DocumentID(document_id=document_id), session=session
    )
    stmt = select(  # type: ignore[no-matching-overload]
        DistrictrMap.comment_length_limit,
        DistrictrMap.comment_count_limit,
    ).where(DistrictrMap.districtr_map_slug == document.districtr_map_slug)
    row = session.exec(stmt).first()
    if row is None:
        return (DEFAULT_MAX_COMMENT_LENGTH, DEFAULT_MAX_COMMENTS_PER_DISTRICT)
    max_length = row[0] if row[0] is not None else DEFAULT_MAX_COMMENT_LENGTH
    max_count = row[1] if row[1] is not None else DEFAULT_MAX_COMMENTS_PER_DISTRICT
    return (max_length, max_count)


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
    ).returning(Commenter)  # Now a DML statement because of the RETURNING clause

    row = session.connection().execute(stmt).one()
    session.commit()
    # Build a fully instrumented ORM instance (NOT model_construct, which
    # bypasses SQLAlchemy instrumentation — the resulting object then fails
    # FastAPI response serialization until the mappers happen to be configured
    # by something else, which made the commenter tests order-dependent).
    return Commenter(**row._asdict())


def create_comment_db(comment_data: CommentCreate, session: Session) -> Comment:
    """
    Create a new comment without commenter foreign key.
    Returns the Comment model with id.
    """
    # if comment is submitted with a document ID, get the document ID
    if comment_data.document_id is not None:
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
    # Ensures the next query still executes within the same transaction
    session.flush()

    if comment_data.document_id is not None:
        create_document_comment(
            comment_id=comment.id,
            document_id=comment_data.document_id,
            session=session,
            zone=None,
        )

    session.commit()

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
    ).returning(Tag)  # Now a DML statement because of the RETURNING clause

    row = session.connection().execute(stmt, {"tag": tag_data.tag}).one()
    session.commit()
    # See create_commenter_db: a real ORM instance, not model_construct.
    return Tag(**row._asdict())


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
    session.connection().execute(stmt)


def create_document_comment(
    comment_id: int, document_id: str, session: Session, zone: int | None = None
) -> DocumentComment | None:
    """
    Create a document comment association (links a form comment to a document).
    Optionally set zone for a scoped map comment.
    """
    document = get_protected_document(
        document_id=DocumentID(document_id=document_id), session=session
    )

    stmt = insert(DocumentComment).values(
        comment_id=comment_id,
        document_id=document.document_id,
        zone=zone,
    )
    session.connection().execute(stmt)
    session.flush()
    doc_comment = session.exec(  # type: ignore[no-matching-overload]
        select(DocumentComment).where(
            and_(
                col(DocumentComment.comment_id) == comment_id,
                col(DocumentComment.document_id) == document.document_id,
            )
        )
    ).first()
    return doc_comment


def _sync_scoped_comments(
    document_id: str,
    comments: list[DistrictCommentInput],
    session: Session,
    association_model,
    scope_column: str,
    title_prefix: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """
    Sync scoped comments for a document.

    Creates/updates comments in comments schema.
    Each comment is {comment_id?, zone, text}. comment_id is optional; if provided
    as parseable int and exists for this document, the comment is updated.
    Limits: 240 chars per comment (after trim), 10 comments per zone.

    Args:
        document_id (str): UUID of the document to sync comments for
        comments (list[DistrictCommentInput]): List of comments to sync, each with optional
            comment_id, zone, and text
        session (Session): SQLAlchemy session for database operations
        association_model: The SQLAlchemy model for the association table (e.g. DocumentComment)
        scope_column: The name of the column in the association model that defines the scope
            (e.g. "zone")
        title_prefix: The prefix to use for comment titles (e.g. "District" or "Community")
        background_tasks (BackgroundTasks | None): Optional FastAPI BackgroundTasks for async
            moderation
    """
    validate_document_exists(
        document_id=DocumentID(document_id=document_id), session=session
    )

    max_comment_length, max_comments_per_district = _get_comment_limits_for_document(
        document_id, session
    )

    # Get existing scoped comment ids for this document (scalars to avoid Row type issues)
    existing_dc = list(
        session.scalars(
            select(association_model.comment_id).where(
                col(association_model.document_id) == document_id
            )
        )
    )

    # Enforce max comments per zone (incoming replaces existing, so count per zone)
    zone_counts: dict[int, int] = {}
    for c in comments:
        if c.zone is not None:
            zone_counts[c.zone] = zone_counts.get(c.zone, 0) + 1
    for zone_val, count in zone_counts.items():
        if count > max_comments_per_district:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {max_comments_per_district} comments per zone (zone {zone_val})",
            )

    kept_comment_ids = set()
    for c in comments:
        zone = c.zone
        # Comment text is required to be a string and have length > 0 by DB constraints
        comment_text = (c.text or "")[:max_comment_length]
        comment_id_str = c.comment_id

        if zone is None:
            continue

        # Try to parse as existing comment id (integer from comments.comment)
        existing_id = None
        if comment_id_str is not None:
            try:
                parsed = int(comment_id_str)
                if parsed in existing_dc:
                    existing_id = parsed
            except (ValueError, TypeError):
                pass

        if existing_id is not None:
            # Update existing comment
            title = f"{title_prefix} {zone} note"
            stmt = (
                update(Comment)
                .where(col(Comment.id) == existing_id)
                .values(comment=comment_text, title=title)
            )
            session.connection().execute(stmt)
            kept_comment_ids.add(existing_id)
            if background_tasks:
                background_tasks.add_task(
                    moderate_comment_by_id, existing_id, f"{title} {comment_text}"
                )
        else:
            # Create new comment
            title = f"{title_prefix} {zone} note"
            new_comment = Comment(
                title=title,
                comment=comment_text,
                commenter_id=None,
            )
            session.add(new_comment)
            session.flush()
            stmt = insert(association_model).values(
                comment_id=new_comment.id,
                document_id=document_id,
                **{scope_column: zone},
            )
            session.connection().execute(stmt)
            kept_comment_ids.add(new_comment.id)
            if background_tasks:
                background_tasks.add_task(
                    moderate_comment_by_id, new_comment.id, f"{title} {comment_text}"
                )

    # Delete scoped comments not in the kept set (association first, then Comment)
    to_delete = [cid for cid in existing_dc if cid not in kept_comment_ids]
    if to_delete:
        session.connection().execute(
            delete(association_model).where(
                and_(
                    col(association_model.document_id) == document_id,
                    col(association_model.comment_id).in_(to_delete),
                )
            )
        )
        session.connection().execute(
            delete(Comment).where(col(Comment.id).in_(to_delete))
        )


def sync_district_comments(
    document_id: str,
    comments: list[DistrictCommentInput],
    session: Session,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """
    Sync scoped comments for a district-based document.

    Creates/updates comments in comments schema.
    Each comment is {comment_id?, zone, text}. comment_id is optional; if provided
    as parseable int and exists for this document, the comment is updated.
    Limits: 240 chars per comment (after trim), 10 comments per zone.

    Args:
        document_id (str): UUID of the document to sync comments for
        comments (list[DistrictCommentInput]): List of comments to sync, each with optional
            comment_id, zone, and text
        session (Session): SQLAlchemy session for database operations
        background_tasks (BackgroundTasks | None): Optional FastAPI BackgroundTasks for async
            moderation
    """
    _sync_scoped_comments(
        document_id=document_id,
        comments=comments,
        session=session,
        association_model=DocumentComment,
        scope_column="zone",
        title_prefix="District",
        background_tasks=background_tasks,
    )


def sync_community_comments(
    document_id: str,
    comments: list[DistrictCommentInput],
    session: Session,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """
    Sync scoped comments for a community-based document.

    Creates/updates comments in comments schema.
    Each comment is {comment_id?, zone, text}. comment_id is optional; if provided
    as parseable int and exists for this document, the comment is updated.
    Limits: 240 chars per comment (after trim), 10 comments per zone.

    Args:
        document_id (str): UUID of the document to sync comments for
        comments (list[DistrictCommentInput]): List of comments to sync, each with optional
            comment_id, zone, and text
        session (Session): SQLAlchemy session for database operations
        background_tasks (BackgroundTasks | None): Optional FastAPI BackgroundTasks for async
            moderation
    """
    _sync_scoped_comments(
        document_id=document_id,
        comments=comments,
        session=session,
        association_model=DocumentComment,
        scope_column="zone",
        title_prefix="Community",
        background_tasks=background_tasks,
    )


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
        created_tags.append(TagWithId(id=tag.id, slug=tag.slug))
    tag_ids = [t.id for t in created_tags]

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
    client_host = request.client.host if request.client else ""
    await recaptcha.verify_recaptcha(commenter_data.recaptcha_token, client_host)
    try:
        commenter = create_commenter_db(commenter_data.commenter, session)
    except IntegrityError as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )

    background_tasks.add_task(moderate_commenter, commenter)
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
    client_host = request.client.host if request.client else ""
    await recaptcha.verify_recaptcha(comment_data.recaptcha_token, client_host)
    try:
        comment = create_comment_db(comment_data.comment, session)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )

    background_tasks.add_task(moderate_comment, comment)
    return comment


@router.post("/tag", response_model=TagWithId, status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_data: TagCreateWithRecaptcha,
    background_tasks: BackgroundTasks,
    request: Request,
    session: Session = Depends(get_session),
):
    """Create a new tag using the slugify_tag SQL function."""
    client_host = request.client.host if request.client else ""
    await recaptcha.verify_recaptcha(tag_data.recaptcha_token, client_host)
    try:
        tag = create_tag_db(tag_data.tag, session)
    except IntegrityError as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )

    background_tasks.add_task(moderate_tag, tag)
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
    client_host = request.client.host if request.client else ""
    await recaptcha.verify_recaptcha(form_data.recaptcha_token, client_host)
    try:
        response = create_full_comment_submission(form_data, session)
    except (DataError, IntegrityError) as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )

    background_tasks.add_task(moderate_submission, response)
    return response


# -----------------------------
# Review tag scoping
# -----------------------------
#
# Any new endpoint gated on the review_content scope MUST take
# `Depends(review_auth)` rather than calling Security(auth.verify, ...) and
# allowed_review_tags separately: the dependency guarantees the tag
# restriction is delivered to every reviewer endpoint. How the restriction is
# applied (intersection filter, blanket 403, per-content-type checks) stays a
# per-handler policy.


def allowed_review_tags(auth_result: dict) -> list[str] | None:
    """Tag slugs the token holder may moderate, or None when unrestricted.

    The CMS (cms/authapi) limits individual reviewers to specific comment
    tags via ReviewTagAssignment rows, minted into the JWT as a `review_tags`
    claim (sorted list of tag slugs). Semantics:

    - `read:read-all` in the token scopes → None (unrestricted): that scope
      means unrestricted read everywhere, and the CMS strips it from
      tag-scoped reviewers so it can act as the admin/superuser escape hatch.
    - `review_tags` claim absent → None (unrestricted): users with no
      assignments are unrestricted (back-compat for internal reviewers).
    - otherwise → the claim's list; an empty list allows nothing.
    """
    token_scopes = (auth_result.get("scope") or "").split()
    if TokenScope.read_all_content in token_scopes:
        return None
    review_tags = auth_result.get("review_tags")
    if review_tags is None:
        return None
    return [str(tag) for tag in review_tags]


@dataclass
class ReviewAuthContext:
    """Verified review_content token plus its tag restriction, if any."""

    payload: dict
    allowed_tags: list[str] | None


async def review_auth(
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.review_content]),
) -> ReviewAuthContext:
    """Auth dependency for ALL review_content-scoped endpoints.

    Bundles scope verification with parsing of the `review_tags` claim so a
    handler cannot accidentally enforce the scope but skip the tag
    restriction. Tests that override app.dependency_overrides[auth.verify]
    keep working: this dependency chains through auth.verify.
    """
    return ReviewAuthContext(
        payload=auth_result,
        allowed_tags=allowed_review_tags(auth_result),
    )


def apply_allowed_tags_filter(stmt: Select, allowed_tags: list[str]) -> Select:
    """Restrict to comments carrying AT LEAST ONE allowed tag.

    A single EXISTS over CommentTag→Tag with `Tag.slug IN allowed` gives
    or-semantics across the reviewer's allowed tags. This is deliberately NOT
    routed through `params.tags`/apply_tag_filter, which AND together one
    EXISTS per tag — a reviewer allowed [a, b] must see comments tagged only
    `a`. Untagged comments never match the EXISTS, so they are invisible to
    restricted reviewers.
    """
    allowed_tag_exists = (
        select(literal(1))
        .select_from(CommentTag)
        .join(Tag, col(Tag.id) == CommentTag.tag_id)
        .where(
            and_(
                col(CommentTag.comment_id) == Comment.id,
                col(Tag.slug).in_(allowed_tags),
            )
        )
        .correlate(Comment)
    )
    return stmt.where(exists(allowed_tag_exists))


# -----------------------------
# Query Helper Functions
# -----------------------------


def build_tag_subquery(tags: list[str] | None, include_admin_columns: bool = False):
    """
    Build a subquery that aggregates tags for each comment.
    Optionally includes admin columns (tag IDs, review status, moderation scores).
    """
    base_columns = [
        col(CommentTag.comment_id),
        func.coalesce(
            func.array_agg(func.distinct(Tag.slug)).filter(col(Tag.slug).isnot(None)),
            [],
        ).label("tags"),
        (
            func.count(
                case(
                    (col(Tag.slug).in_(tags) if tags else False, 1),  # type: ignore
                    else_=None,
                )
            ).label("matching_tag_count")
            if tags
            else literal(0).label("matching_tag_count")
        ),
    ]

    if include_admin_columns:
        base_columns.extend(
            [
                func.coalesce(func.array_agg(col(Tag.id)), []).label("tag_ids"),
                func.coalesce(
                    func.array_agg(cast(Tag.review_status, String)), []
                ).label("tag_review_status"),
                func.coalesce(func.array_agg(col(Tag.moderation_score)), []).label(
                    "tag_moderation_score"
                ),
            ]
        )

    return (
        select(*base_columns)
        .select_from(CommentTag)
        .outerjoin(Tag, col(Tag.id) == CommentTag.tag_id)
        .group_by(col(CommentTag.comment_id))
    ).subquery()


def apply_document_filter(stmt: Select, public_id: int | None) -> Select:
    """Apply document filter via EXISTS subquery if public_id is provided."""
    if not public_id:
        return stmt

    doc_exists = (
        select(literal(1))
        .select_from(DocumentComment)
        .join(Document, col(Document.document_id) == DocumentComment.document_id)
        .where(
            and_(
                col(DocumentComment.comment_id) == Comment.id,
                col(Document.public_id) == public_id,
            )
        )
        .correlate(Comment)
    )
    return stmt.where(exists(doc_exists))


def apply_comment_id_filter(stmt: Select, comment_id: int | None) -> Select:
    """Filter by specific comment ID."""
    if comment_id is None:
        return stmt
    return stmt.where(col(Comment.id) == comment_id)


def apply_review_flagged_filter(stmt: Select, review_flagged: bool | None) -> Select:
    """Filter by review_flagged status. When True, return only flagged comments."""
    if review_flagged is None:
        return stmt
    return stmt.where(col(Comment.review_flagged) == review_flagged)


def apply_document_id_filter(stmt: Select, document_id: str | None) -> Select:
    """Apply document filter by document UUID (for district comments lookup)."""
    if not document_id:
        return stmt
    return stmt.where(
        and_(
            col(DocumentComment.document_id) == document_id,
            col(DocumentComment.zone).is_not(None),
        )
    )


def apply_public_id_filter_for_district(stmt: Select, public_id: int | None) -> Select:
    """Filter district comments by document public_id."""
    if public_id is None:
        return stmt
    return stmt.where(col(Document.public_id) == public_id)


def apply_exclude_district_comments(stmt: Select) -> Select:
    """Exclude district comments (DocumentComment with zone IS NOT NULL) from results."""
    return stmt.where(
        or_(
            col(DocumentComment.comment_id).is_(None),
            col(DocumentComment.zone).is_(None),
        )
    )


def apply_location_filters(
    stmt: Select, place: str | None, state: str | None, zip_code: str | None
) -> Select:
    """Apply location-based filters (place, state, zip_code) to the query."""
    if place:
        stmt = stmt.where(col(Commenter.place) == place)
    if state:
        stmt = stmt.where(col(Commenter.state) == state)
    if zip_code:
        stmt = stmt.where(col(Commenter.zip_code) == zip_code)
    return stmt


def apply_tag_filter(stmt: Select, tag_subquery, tags: list[str] | None) -> Select:
    """Filter comments to those with all matching tags (each tag in filter must be present)."""
    if tags:
        # For each tag in the filter, ensure it exists for the comment
        # We check that the comment has associations to all requested tags
        for tag_slug in tags:
            tag_exists = (
                select(literal(1))
                .select_from(CommentTag)
                .join(Tag, col(Tag.id) == CommentTag.tag_id)
                .where(
                    and_(
                        col(CommentTag.comment_id) == Comment.id,
                        col(Tag.slug) == tag_slug,
                    )
                )
                .correlate(Comment)
            )
            stmt = stmt.where(exists(tag_exists))
    return stmt


def get_comments_base_query(
    params: CommentFilterParams,
    search: str | None = None,
    has_map: bool | None = None,
) -> Select:
    """
    Return comments that pass moderation gates, with ALL their attached tags.
    If any moderation gate fails (comment, commenter, or any attached tag),
    the whole comment is excluded.
    """
    tag_subquery = build_tag_subquery(params.tags, include_admin_columns=False)

    stmt = (
        select(
            col(Comment.title),
            col(Comment.comment),
            col(Comment.created_at),
            col(Commenter.first_name),
            col(Commenter.last_name),
            col(Commenter.place),
            col(Commenter.state),
            col(Commenter.zip_code),
            func.coalesce(tag_subquery.c.tags, []).label("tags"),
            col(Document.public_id),
        )
        .select_from(Comment)
        .outerjoin(Commenter, col(Comment.commenter_id) == Commenter.id)
        .outerjoin(tag_subquery, col(Comment.id) == tag_subquery.c.comment_id)
        .outerjoin(DocumentComment, col(DocumentComment.comment_id) == Comment.id)
        .outerjoin(Document, col(Document.document_id) == DocumentComment.document_id)
        .limit(params.limit)
        .offset(params.offset)
    )

    # Apply common filters
    stmt = apply_document_filter(stmt, params.public_id)
    stmt = apply_exclude_district_comments(stmt)
    stmt = apply_location_filters(stmt, params.place, params.state, params.zip_code)
    stmt = apply_tag_filter(stmt, tag_subquery, params.tags)

    # Text search filter (ILIKE on title and comment)
    if search:
        search_pattern = f"%{search}%"
        stmt = stmt.where(
            or_(
                col(Comment.title).ilike(search_pattern),
                col(Comment.comment).ilike(search_pattern),
            )
        )

    # Has map filter (comments with associated map)
    if has_map is not None:
        if has_map:
            stmt = stmt.where(col(Document.public_id).isnot(None))
        else:
            stmt = stmt.where(col(Document.public_id).is_(None))

    return stmt


def moderate_comments_query(
    stmt: Select,
    moderation_threshold: float = MODERATION_THRESHOLD,
) -> Select:
    """
    Apply moderation gates to a public comment list query:
      - Comment: must pass (approved, unscored, or under threshold) AND not REJECTED
      - Commenter: if present, must pass (same rules) AND not REJECTED
      - Tags: excluded if ANY attached tag is REJECTED or scored offensive
    """

    def passes_entity(score_col, status_col):
        # Approved always passes. Else must be under threshold or NULL (None).
        return or_(
            status_col == ReviewStatus.APPROVED,
            score_col.is_(None),
            score_col < moderation_threshold,
        )

    # Comment moderation
    comment_ok = and_(
        col(Comment.review_status) != ReviewStatus.REJECTED,
        passes_entity(Comment.moderation_score, Comment.review_status),
    )
    stmt = stmt.where(comment_ok)

    # Commenter moderation (if commenter exists)
    commenter_ok = and_(
        col(Commenter.review_status) != ReviewStatus.REJECTED,
        passes_entity(Commenter.moderation_score, Commenter.review_status),
    )
    stmt = stmt.where(or_(col(Commenter.id).is_(None), commenter_ok))

    # Tag moderation: exclude the entire comment if ANY attached tag fails.
    # We phrase this as NOT EXISTS(bad_tag). score_text semantics: 0=clean, 1=offensive,
    # so "bad" means score at or above threshold.
    bad_tag_conds = [
        Tag.review_status == ReviewStatus.REJECTED,
        and_(
            col(Tag.review_status) != ReviewStatus.APPROVED,
            col(Tag.moderation_score).is_not(None),
            col(Tag.moderation_score) >= moderation_threshold,
        ),
    ]

    bad_tag_exists = (
        select(literal(1))
        .select_from(CommentTag)
        .join(Tag, col(Tag.id) == CommentTag.tag_id)
        .where(
            and_(
                col(CommentTag.comment_id) == Comment.id,
                or_(*bad_tag_conds),
            )
        )
        .correlate(Comment)
    )
    # Allow comments with no tags (NOT EXISTS bad tag is trivially true)
    return stmt.where(~exists(bad_tag_exists))


def get_admin_query(
    params: CommentFilterParams,
    max_moderation_score: float,
    review_status: ReviewStatus | None,
) -> Select:
    """
    Return admin comments query with all admin columns and moderation filtering.
    """
    tag_subquery = build_tag_subquery(params.tags, include_admin_columns=True)

    stmt = (
        select(
            col(Comment.title),
            col(Comment.comment),
            col(Commenter.first_name),
            col(Commenter.last_name),
            col(Commenter.place),
            col(Commenter.state),
            col(Commenter.zip_code),
            func.coalesce(tag_subquery.c.tags, []).label("tags"),
            col(Document.public_id),
            col(Comment.id).label("comment_id"),
            col(Comment.review_status).label("comment_review_status"),
            col(Comment.moderation_score).label("comment_moderation_score"),
            col(Comment.review_flagged).label("comment_review_flagged"),
            col(Commenter.id).label("commenter_id"),
            col(Commenter.review_status).label("commenter_review_status"),
            col(Commenter.moderation_score).label("commenter_moderation_score"),
            func.coalesce(tag_subquery.c.tag_ids, []).label("tag_ids"),
            func.coalesce(tag_subquery.c.tag_review_status, []).label(
                "tag_review_status"
            ),
            func.coalesce(tag_subquery.c.tag_moderation_score, []).label(
                "tag_moderation_score"
            ),
            col(DocumentComment.zone).label("zone"),
            col(DocumentComment.document_id).label("document_id"),
        )
        .select_from(Comment)
        .outerjoin(Commenter, col(Comment.commenter_id) == Commenter.id)
        .outerjoin(tag_subquery, col(Comment.id) == tag_subquery.c.comment_id)
        .outerjoin(DocumentComment, col(DocumentComment.comment_id) == Comment.id)
        .outerjoin(Document, col(Document.document_id) == DocumentComment.document_id)
        .limit(params.limit)
        .offset(params.offset)
    )

    # Apply common filters
    stmt = apply_document_filter(stmt, params.public_id)
    stmt = apply_exclude_district_comments(stmt)
    stmt = apply_comment_id_filter(stmt, params.comment_id)
    stmt = apply_review_flagged_filter(stmt, params.review_flagged)
    stmt = apply_location_filters(stmt, params.place, params.state, params.zip_code)
    stmt = apply_tag_filter(stmt, tag_subquery, params.tags)

    # Admin-specific moderation filtering
    stmt = stmt.where(
        and_(
            or_(
                col(Comment.moderation_score) <= max_moderation_score,
                col(Comment.moderation_score).is_(None),
            ),
            (
                col(Comment.review_status) == review_status
                if review_status
                else col(Comment.review_status).is_(None)
            ),
        )
    )

    return stmt


def get_admin_district_comments_query(
    params: CommentFilterParams,
    max_moderation_score: float,
    review_status: ReviewStatus | None,
) -> Select:
    """
    Return admin query for district comments only (DocumentComment with zone IS NOT NULL).
    Filter by document_id to look up comments for a specific document.
    """
    tag_subquery = build_tag_subquery(None, include_admin_columns=True)

    stmt = (
        select(
            col(Comment.title),
            col(Comment.comment),
            col(Commenter.first_name),
            col(Commenter.last_name),
            col(Commenter.place),
            col(Commenter.state),
            col(Commenter.zip_code),
            func.coalesce(tag_subquery.c.tags, []).label("tags"),
            col(Document.public_id),
            col(Comment.id).label("comment_id"),
            col(Comment.review_status).label("comment_review_status"),
            col(Comment.moderation_score).label("comment_moderation_score"),
            col(Comment.review_flagged).label("comment_review_flagged"),
            col(Commenter.id).label("commenter_id"),
            col(Commenter.review_status).label("commenter_review_status"),
            col(Commenter.moderation_score).label("commenter_moderation_score"),
            func.coalesce(tag_subquery.c.tag_ids, []).label("tag_ids"),
            func.coalesce(tag_subquery.c.tag_review_status, []).label(
                "tag_review_status"
            ),
            func.coalesce(tag_subquery.c.tag_moderation_score, []).label(
                "tag_moderation_score"
            ),
            col(DocumentComment.zone).label("zone"),
            col(DocumentComment.document_id).label("document_id"),
        )
        .select_from(Comment)
        .outerjoin(Commenter, col(Comment.commenter_id) == Commenter.id)
        .outerjoin(tag_subquery, col(Comment.id) == tag_subquery.c.comment_id)
        .join(DocumentComment, col(DocumentComment.comment_id) == Comment.id)
        .outerjoin(Document, col(Document.document_id) == DocumentComment.document_id)
        .where(col(DocumentComment.zone).is_not(None))
        .limit(params.limit)
        .offset(params.offset)
    )

    stmt = apply_document_id_filter(stmt, params.document_id)
    stmt = apply_public_id_filter_for_district(stmt, params.public_id)
    stmt = apply_comment_id_filter(stmt, params.comment_id)
    stmt = apply_review_flagged_filter(stmt, params.review_flagged)
    stmt = apply_location_filters(stmt, params.place, params.state, params.zip_code)

    stmt = stmt.where(
        and_(
            or_(
                col(Comment.moderation_score) <= max_moderation_score,
                col(Comment.moderation_score).is_(None),
            ),
            (
                col(Comment.review_status) == review_status
                if review_status
                else col(Comment.review_status).is_(None)
            ),
        )
    )

    return stmt


@router.get(
    "/list",
    response_model=list[PublicCommentResponse],
)
async def list_comments(
    *,
    session: Session = Depends(get_session),
    public_id: int | None = None,
    tags: list[str] | None = Query(default=None),
    place: str | None = Query(default=None),
    state: str | None = Query(default=None),
    zip_code: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
    search: str | None = Query(
        default=None, description="Search in title and comment text"
    ),
    has_map: bool | None = Query(
        default=None, description="Filter for comments with/without maps"
    ),
):
    params = CommentFilterParams(
        tags=tags,
        place=place,
        state=state,
        zip_code=zip_code,
        limit=limit,
        offset=offset,
        public_id=public_id,
    )
    stmt = get_comments_base_query(params, search=search, has_map=has_map)
    stmt = moderate_comments_query(stmt)
    results = session.exec(stmt).all()  # type: ignore[no-matching-overload]
    return results


@router.get("/admin/list", response_model=list[AdminCommentResponse])
async def list_comments_admin(
    tags: list[str] = Query(default=[]),
    place: str = Query(default=None),
    state: str = Query(default=None),
    zip_code: str = Query(default=None),
    public_id: int = Query(default=None),
    comment_id: int | None = Query(
        default=None, description="Look up specific comment by ID"
    ),
    review_flagged: bool | None = Query(
        default=None,
        description="When True, filter to comments flagged for review",
    ),
    max_moderation_score: float = Query(default=1.0),
    offset: int = Query(default=0),
    limit: int = Query(default=100),
    session: Session = Depends(get_session),
    review_ctx: ReviewAuthContext = Depends(review_auth),
    review_status: ReviewStatus = Query(default=None),
):
    # Tag-scoped reviewers (see allowed_review_tags): requested tags are
    # intersected with the allowed set — asking only for tags outside the
    # scope short-circuits to [] — and every result must carry at least one
    # allowed tag (apply_allowed_tags_filter below), so untagged comments
    # stay invisible to restricted reviewers.
    allowed_tags = review_ctx.allowed_tags
    if allowed_tags is not None and tags:
        tags = [tag for tag in tags if tag in allowed_tags]
        if not tags:
            return []
    params = CommentFilterParams(
        tags=tags if tags else None,
        place=place,
        state=state,
        zip_code=zip_code,
        limit=limit,
        offset=offset,
        public_id=public_id,
        comment_id=comment_id,
        review_flagged=review_flagged,
    )
    stmt = get_admin_query(
        params,
        max_moderation_score=max_moderation_score,
        review_status=review_status,
    )
    if allowed_tags is not None:
        stmt = apply_allowed_tags_filter(stmt, allowed_tags)
    results = session.exec(stmt).all()  # type: ignore[no-matching-overload]
    return results


@router.get("/admin/district-comments/list", response_model=list[AdminCommentResponse])
async def list_district_comments_admin(
    document_id: str | None = Query(
        default=None, description="Filter by document UUID to look up district comments"
    ),
    public_id: int | None = Query(
        default=None,
        description="Filter by public ID (map number) to look up district comments",
    ),
    comment_id: int | None = Query(
        default=None, description="Look up specific comment by ID"
    ),
    review_flagged: bool | None = Query(
        default=None,
        description="When True, filter to comments flagged for review",
    ),
    place: str = Query(default=None),
    state: str = Query(default=None),
    zip_code: str = Query(default=None),
    max_moderation_score: float = Query(default=1.0),
    offset: int = Query(default=0),
    limit: int = Query(default=100),
    session: Session = Depends(get_session),
    review_ctx: ReviewAuthContext = Depends(review_auth),
    review_status: ReviewStatus = Query(default=None),
):
    """List district-level comments for moderation. Filter by document_id, public_id, or comment_id."""
    # District comments are created tag-less (_sync_scoped_comments builds
    # bare Comment rows with no CommentTag links) and this query applies no
    # tag filtering, so there is nothing for a tag scope to match against.
    # Tag-scoped reviewers are therefore refused outright — simpler and safe,
    # rather than silently returning everything or nothing.
    if review_ctx.allowed_tags is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your review access is restricted to specific comment tags; "
                "district comments are not tagged and cannot be reviewed "
                "with a tag-restricted account."
            ),
        )
    params = CommentFilterParams(
        place=place,
        state=state,
        zip_code=zip_code,
        limit=limit,
        offset=offset,
        document_id=document_id,
        public_id=public_id,
        comment_id=comment_id,
        review_flagged=review_flagged,
    )
    stmt = get_admin_district_comments_query(
        params,
        max_moderation_score=max_moderation_score,
        review_status=review_status,
    )
    results = session.exec(stmt).all()  # type: ignore[no-matching-overload]
    return results


@router.post("/flag", status_code=status.HTTP_200_OK)
async def flag_comment(
    body: FlagCommentRequest,
    session: Session = Depends(get_session),
):
    """Flag a comment for moderator review. Used when users believe a moderation decision was in error."""
    comment = session.get(Comment, body.comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Only allow flagging comments that are publicly listable (not already REJECTED).
    # Flagging a rejected comment gives moderators no signal (it's already hidden) and
    # is a way to harass the moderation queue.
    if comment.review_status == ReviewStatus.REJECTED:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.review_flagged = True
    session.add(comment)
    session.commit()
    return {"message": "Comment flagged for review", "comment_id": body.comment_id}


@router.post("/admin/review", response_model=ReviewUpdateResponse)
async def review_comment(
    review_data: ReviewStatusUpdate,
    session: Session = Depends(get_session),
    review_ctx: ReviewAuthContext = Depends(review_auth),
):
    model = {
        "comment": Comment,
        "commenter": Commenter,
        "tag": Tag,
    }[review_data.content_type]

    entry = session.get(model, review_data.id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Tag-scoped reviewers (see allowed_review_tags) may only act within
    # their allowed tags:
    # - tag: the tag itself must be allowed;
    # - comment: the comment must carry at least one allowed tag;
    # - commenter: never — commenters span tags, so they are not tag-scoped.
    allowed_tags = review_ctx.allowed_tags
    if allowed_tags is not None:
        if review_data.content_type == "commenter":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your review access is restricted to specific comment "
                    "tags; commenters are not tag-scoped and cannot be "
                    "reviewed with a tag-restricted account."
                ),
            )
        if review_data.content_type == "tag" and entry.slug not in allowed_tags:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Your review access is restricted to tags "
                    f"{sorted(allowed_tags)}; tag '{entry.slug}' is outside "
                    "that scope."
                ),
            )
        if review_data.content_type == "comment":
            has_allowed_tag = session.exec(  # type: ignore[no-matching-overload]
                select(literal(1))
                .select_from(CommentTag)
                .join(Tag, col(Tag.id) == CommentTag.tag_id)
                .where(
                    and_(
                        col(CommentTag.comment_id) == review_data.id,
                        col(Tag.slug).in_(allowed_tags),
                    )
                )
                .limit(1)
            ).first()
            if has_allowed_tag is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"Your review access is restricted to tags "
                        f"{sorted(allowed_tags)}; this comment carries none "
                        "of them."
                    ),
                )

    entry.review_status = review_data.review_status
    # Clearing the flag on review resolves the item from the moderator queue.
    # Comment is the only entity that carries review_flagged today.
    if hasattr(entry, "review_flagged"):
        entry.review_flagged = False
    session.add(entry)
    session.commit()
    session.refresh(entry)

    return ReviewUpdateResponse(
        message=f"{review_data.content_type} review status updated to {review_data.review_status.value}",
        id=review_data.id,
        new_status=review_data.review_status.value,
    )
