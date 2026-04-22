from fastapi import (
    FastAPI,
    status,
    Depends,
    HTTPException,
    Query,
)
from typing import Annotated
import botocore.exceptions
from sqlalchemy.exc import (
    MultipleResultsFound,
    NoResultFound,
    DataError,
    IntegrityError,
)
from sqlalchemy import text
from sqlalchemy.types import Integer
from sqlmodel import Session, String, select, true, update, col, literal
from starlette.middleware.cors import CORSMiddleware
import logging
from sqlalchemy import bindparam
from sqlmodel import ARRAY
from datetime import datetime
from uuid import UUID, uuid4
import sentry_sdk
from app.assignments import (
    duplicate_document_assignments,
    duplicate_document_community_assignments,
    batch_insert_assignments,
)
from app.core.db import get_session
from app.core.dependencies import (
    get_document,
    get_document_public,
    get_protected_document,
    get_districtr_map,
    parse_document_id,
)
from app.core.models import DocumentID
from app.core.config import settings
import app.exports.main as exports
import app.cms.main as cms
import app.comments.main as comments
from app.comments.main import sync_district_comments, sync_community_comments
from app.comments.models import DistrictCommentInput
import app.contiguity.main as contiguity
import app.save_share.main as save_share
import app.thumbnails.main as thumbnails
from networkx import Graph, connected_components
from app.models import (
    Assignments,
    AssignmentsResponse,
    ColorsSetResult,
    CommunityAssignments,
    DocumentType,
    DistrictrMap,
    DistrictrMapsToGroups,
    Document,
    DocumentCreate,
    DocumentCreatePublic,
    DocumentPublic,
    DocumentMetadata,
    MAX_COMMUNITY_NAME_LENGTH,
    UUIDType,
    ParentChildEdges,
    ShatterResult,
    BBoxGeoJSONs,
    MapGroup,
    AssignmentsCreate,
    NumDistrictsSetResult,
)
from app.comments.models import (
    Comment,
    DocumentComment as FormDocumentComment,
    Tag,
    CommentTag,
)
from pydantic_geojson import PolygonModel
from pydantic_geojson._base import Coordinates
from sqlalchemy.sql import func
from sqlalchemy.sql.functions import coalesce
from app.utils import update_or_select_district_stats
from aiocache import SimpleMemoryCache
from contextlib import asynccontextmanager
from fiona.transform import transform
from fastapi import BackgroundTasks
from ._sanitize import (
    CommentDict,
    _load_existing_community_metadata,
    _validate_community_save_payload,
)

if settings.ENVIRONMENT in ("production", "qa"):
    sentry_sdk.init(
        dsn="https://b14aae02017e3a9c425de4b22af7dd0c@o4507623009091584.ingest.us.sentry.io/4507623009746944",
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
        environment=settings.ENVIRONMENT.value,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(exports.router)
app.include_router(cms.router)
app.include_router(comments.router)
app.include_router(save_share.router)
app.include_router(thumbnails.router)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
VERBOSE_LOGGING = settings.VERBOSE_LOGGING

cache = SimpleMemoryCache()


# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    allow_origins = [str(origin).strip("/") for origin in settings.BACKEND_CORS_ORIGINS]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def update_timestamp(
    session: Session,
    document_id: str,
) -> datetime:
    update_stmt = (
        update(Document)
        .where(col(Document.document_id) == document_id)
        .values(updated_at=func.now())
        .returning(
            Document.updated_at
        )  # The `returning` on this makes it into a DML statement
    )
    updated_at = session.connection().execute(update_stmt).scalar_one()
    return updated_at


_PARTITION_TABLES = ("assignments", "community_assignments")


def _validate_partition_identifiers(document_id: str, table_name: str) -> None:
    if table_name not in _PARTITION_TABLES:
        raise ValueError(
            f"Unsupported partition table: {table_name!r}. "
            f"Expected one of {_PARTITION_TABLES}."
        )
    try:
        UUID(document_id)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError(f"document_id must be a UUID; got {document_id!r}") from exc


def create_document_partition(
    session: Session, document_id: str, table_name: str
) -> None:
    """
    Create a partition for a document in the specified table (assignments or community_assignments).

    Args:
        session (Session): The database session to use for executing the SQL statement.
        document_id (str): The ID of the document for which to create the partition.
        table_name (str): Must be one of "assignments" or "community_assignments".
    """
    _validate_partition_identifiers(document_id, table_name)
    partition_name = f"document.{table_name}_{document_id}"
    stmt = text(f"""
        CREATE TABLE "{partition_name}"
        PARTITION OF document.{table_name}
        FOR VALUES IN ('{document_id}')
    """)
    session.connection().execute(stmt)


def reset_document_partition(
    session: Session, document_id: str, table_name: str
) -> None:
    """
    Drop and recreate a partition for a document in the specified table
    (assignments or community_assignments).

    Args:
        session (Session): The database session to use for executing the SQL statements.
        document_id (str): The ID of the document for which to reset the partition.
        table_name (str): Must be one of "assignments" or "community_assignments".
    """
    _validate_partition_identifiers(document_id, table_name)
    partition_name = f"document.{table_name}_{document_id}"
    session.connection().execute(
        text(f'DROP TABLE IF EXISTS "{partition_name}" CASCADE;')
    )
    stmt = text(f"""
        CREATE TABLE "{partition_name}"
        PARTITION OF document.{table_name}
        FOR VALUES IN ('{document_id}')
    """)
    session.connection().execute(stmt)


def duplicate_document_comments(
    *,
    from_document_id: str,
    to_document_id: str,
    session: Session,
) -> int:
    """
    Deep-copy DocumentComment associations (and their backing Comment rows) from one
    document to another. New Comment rows are inserted with title/comment/commenter
    inherited from the source; moderation_score / review_status are intentionally left
    unset so the target document re-moderates on next save.

    Called from create_document when copying a map so that coverage validation on the
    first subsequent save can succeed.
    """
    source_rows = session.exec(
        select(
            Comment.title,
            Comment.comment,
            Comment.commenter_id,
            col(FormDocumentComment.zone).label("zone"),
        )
        .join(
            FormDocumentComment,
            col(FormDocumentComment.comment_id) == col(Comment.id),
        )
        .where(col(FormDocumentComment.document_id) == from_document_id)
    ).all()

    duplicated = 0
    for row in source_rows:
        new_comment = Comment(
            title=row.title,
            comment=row.comment,
            commenter_id=row.commenter_id,
        )
        session.add(new_comment)
        session.flush()
        session.add(
            FormDocumentComment(
                comment_id=new_comment.id,
                document_id=to_document_id,
                zone=row.zone,
            )
        )
        duplicated += 1
    return duplicated


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/db_is_alive")
async def db_is_alive(session: Session = Depends(get_session)):
    try:
        session.connection().execute(text("SELECT 1"))
        return {"message": "DB is alive"}
    except Exception as e:
        logger.error(e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB is unreachable"
        )


@app.get("/api/document/{document_id}/stats")
async def get_document_stats(
    background_tasks: BackgroundTasks,
    document: Annotated[Document, Depends(get_protected_document)],
    session: Session = Depends(get_session),
):
    return update_or_select_district_stats(
        session, document.document_id, background_tasks
    )


# matches createMapObject in apiHandlers.ts
@app.post(
    "/api/create_document",
    response_model=DocumentCreatePublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_document(
    data: DocumentCreate, session: Session = Depends(get_session)
):
    # Get DistrictrMap to inherit num_districts and other fields
    districtr_map_stmt = select(DistrictrMap).where(
        DistrictrMap.districtr_map_slug == data.districtr_map_slug
    )
    districtr_map = session.exec(districtr_map_stmt).first()
    if not districtr_map:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DistrictrMap matching {data.districtr_map_slug} does not exist.",
        )

    # Determine num_districts: from copied document if copying, otherwise from DistrictrMap
    num_districts = districtr_map.num_districts
    num_communities = None
    community_metadata_list = None
    copied_document = None

    if data.copy_from_doc is not None:
        copy_document_id = parse_document_id(data.copy_from_doc)
        if not copy_document_id:
            raise HTTPException(status_code=404, detail="Document not found")
        copied_document = get_protected_document(
            document_id=copy_document_id, session=session
        )
        # Inherit num_districts from source document, with fallback to DistrictrMap
        num_districts = copied_document.num_districts or districtr_map.num_districts
        if copied_document.map_type == "community":
            num_communities = copied_document.num_communities
            community_metadata_list = copied_document.community_metadata_list

    document_type = data.document_type or (
        copied_document.document_type if copied_document is not None else None
    )
    if document_type is None:
        document_type = (
            DocumentType.COI if data.map_type == "community" else DocumentType.DISTRICT
        )
    else:
        document_type = DocumentType(document_type)

    document_map_type = (
        data.map_type
        or ("community" if document_type == DocumentType.COI else None)
        or (copied_document.map_type if copied_document is not None else None)
        or districtr_map.map_type
        or "default"
    )
    # Normalize: map_type is the canonical source of truth for document_type.
    # community map_type => COI, everything else => DISTRICT.
    document_type = (
        DocumentType.COI if document_map_type == "community" else DocumentType.DISTRICT
    )
    if document_map_type != "community":
        num_communities = None
        community_metadata_list = None

    # Reject copying across map_type boundaries: source and target must match, otherwise
    # assignments can't be carried over (community_assignments and assignments have
    # different shapes) and the copy would silently produce an empty doc.
    if copied_document is not None and copied_document.map_type != document_map_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot copy a {copied_document.map_type!r} map into a "
                f"{document_map_type!r} map. Start a new map instead."
            ),
        )

    # Reject initial assignments when creating a community map: batch_insert_assignments
    # writes to document.assignments (district-mode table), which would silently orphan
    # data from a community document that reads from document.community_assignments.
    if (
        document_map_type == "community"
        and data.assignments is not None
        and len(data.assignments) > 0
        and copied_document is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Initial assignments cannot be provided when creating a community map. "
                "Create the document first, then PUT /api/assignments with "
                "map_type='community'."
            ),
        )

    # Generate UUID for document_id
    document_id = str(uuid4())

    # Create Document object
    new_document = Document(
        document_id=document_id,
        districtr_map_slug=data.districtr_map_slug,
        map_type=document_map_type,
        document_type=document_type,
        num_districts=num_districts,
        num_communities=num_communities,
        community_metadata_list=community_metadata_list,
    )
    session.add(new_document)
    session.flush()  # Flush to get the public_id assigned
    # Under most circumstances, we DO NOT want to use f-strings in SQL statements.
    # However, in this case, we are using a dynamic table name, and SQLAlchemy / Postgres do not
    # support bind params for identifiers or partition values, so we need to use f-strings.
    create_document_partition(session, document_id, "assignments")
    create_document_partition(session, document_id, "community_assignments")

    created_document = get_document(
        document_id=DocumentID(document_id=document_id), session=session
    )

    total_assignments = 0

    if copied_document is not None:
        logger.info(
            f"Copying document. Origin document: {copied_document.document_id} to {document_id}"
        )
        assert copied_document.document_id is not None
        if document_map_type == "community":
            total_assignments = duplicate_document_community_assignments(
                from_document_id=copied_document.document_id,
                to_document_id=document_id,
                session=session,
            )
            total_assignments = total_assignments or 0
        else:
            total_assignments = duplicate_document_assignments(
                from_document_id=copied_document.document_id,
                to_document_id=document_id,
                session=session,
            )
            total_assignments = total_assignments or 0
        # Carry the source document's comments/descriptions to the new document so the
        # first save against the copy can satisfy coverage validation.
        duplicated_comments = duplicate_document_comments(
            from_document_id=copied_document.document_id,
            to_document_id=document_id,
            session=session,
        )
        if VERBOSE_LOGGING and duplicated_comments:
            logger.info(
                f"Duplicated {duplicated_comments} comment(s) from "
                f"{copied_document.document_id} to {document_id}"
            )

    elif data.assignments is not None and len(data.assignments) > 0:
        max_records = 914_231
        if len(data.assignments) > max_records:
            # Texas had 914_231 in the 2010 Census
            # https://www.census.gov/geographies/reference-files/time-series/geo/tallies.html
            # We don't expect any maps larger than that
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Upload size exceeds maximum allowed limit ({max_records} records)",
            )

        try:
            total_assignments = batch_insert_assignments(
                document_id=document_id,
                assignments=data.assignments,
                districtr_map_slug=data.districtr_map_slug,
                session=session,
            )
        except NoResultFound:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No districtr map found matching requested map",
            )
        except IntegrityError as e:
            if "psycopg.errors.UniqueViolation" in str(e):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Duplicate geoids found in input data. Ensure all geoids are unique",
                )

    if data.metadata is not None:
        # Inline (without an inner commit) so that the session.rollback() checks below
        # can still undo the document insert, partitions, assignment copy, and
        # duplicated comments. The standalone /api/document/{id}/metadata endpoint
        # still commits via its own handler.
        logger.info(f"Updating metadata for document: {document_id}")
        session.connection().execute(
            update(Document)
            .where(Document.document_id == document_id)  # type: ignore
            .values(map_metadata=data.metadata.model_dump(exclude_unset=True))
        )

    stmt = (
        select(  # type: ignore[no-matching-overload]
            col(Document.document_id),
            col(Document.public_id),
            col(Document.created_at),
            col(Document.districtr_map_slug),
            col(DistrictrMap.gerrydb_table_name).label("gerrydb_table"),
            Document.updated_at,
            col(DistrictrMap.uuid).label("map_uuid"),
            col(DistrictrMap.parent_layer).label("parent_layer"),
            col(DistrictrMap.child_layer).label("child_layer"),
            col(DistrictrMap.tiles_s3_path).label("tiles_s3_path"),
            col(DistrictrMap.name).label("map_module"),
            coalesce(Document.num_districts, DistrictrMap.num_districts).label(
                "num_districts"
            ),
            col(Document.num_communities),
            col(Document.community_metadata_list),
            col(DistrictrMap.num_districts_modifiable).label(
                "num_districts_modifiable"
            ),
            col(DistrictrMap.extent).label("extent"),
            col(Document.map_type).label("map_type"),
            col(Document.document_type).label("document_type"),
            col(DistrictrMap.statefps).label("statefps"),
            literal(MAX_COMMUNITY_NAME_LENGTH).label("community_name_length_limit"),
            coalesce(total_assignments).label("inserted_assignments"),
            col(Document.map_metadata),
        )
        .where(col(Document.document_id) == document_id)
        .join(
            DistrictrMap,
            col(Document.districtr_map_slug) == DistrictrMap.districtr_map_slug,
            isouter=True,
        )
        .limit(1)
    )

    doc = (
        session.connection()
        .execute(
            stmt,
        )
        .one()
    )

    if not doc.map_uuid:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DistrictrMap matching {data.districtr_map_slug} does not exist.",
        )
    if not doc.document_id:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document creation failed - no doc id",
        )
    if not doc.parent_layer:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document creation failed - no parent layer",
        )

    session.commit()

    return doc


@app.put("/api/assignments")
async def update_assignments(
    data: AssignmentsCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """
    Update assignments for a document with optimistic concurrency control.

    This endpoint replaces all existing assignments for a document with the provided
    assignments. It uses optimistic concurrency control to prevent overwriting changes
    made by other clients.

    The last_updated_at parameter is used for conflict detection:
    - The client should provide the timestamp of the last known update to the document
    - The server compares this with the document's current updated_at timestamp in the database
    - If the database timestamp is newer (document was modified by another client),
      a 409 Conflict error is raised unless overwrite=True
    - This ensures that concurrent updates don't silently overwrite each other's changes. They
      must be explicitly allowed by setting overwrite=True.

    Args:
        data (AssignmentsCreate): The request data containing:
            - document_id: The ID of the document to update
            - assignments: List of assignment pairs [[geo_id, zone], ...]
            - last_updated_at: Timestamp of the client's last known update (for conflict detection)
            - overwrite: If True, allows overwriting even if document was updated by another client
            - metadata: Optional metadata to update the document
        session (Session): Database session dependency

    Returns:
        dict: Response containing:
            - assignments_inserted: Number of assignments inserted
            - updated_at: New timestamp after the update

    Raises:
        HTTPException: 400 if no assignments provided
        HTTPException: 409 if document was updated by another client and overwrite=False
    """
    has_assignments = len(data.assignments) > 0
    has_metadata = data.metadata is not None
    has_comments = data.comments is not None
    if not has_assignments and not has_metadata and not has_comments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No changes provided",
        )

    document_id = data.document_id
    assignments = data.assignments  # [[geo_id, zone], ...]
    last_updated_at = data.last_updated_at
    actual_map_type = session.exec(
        select(Document.map_type).where(Document.document_id == document_id)
    ).one_or_none()
    if actual_map_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {document_id}",
        )
    requested_map_type = data.map_type or actual_map_type
    requested_is_community = requested_map_type == "community"
    actual_is_community = actual_map_type == "community"
    if requested_is_community != actual_is_community:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Map type mismatch: document uses "
                f"`{actual_map_type}` save semantics but request specified "
                f"`{requested_map_type}`."
            ),
        )

    is_community_map = actual_is_community
    assignment_table = (
        "document.community_assignments" if is_community_map else "document.assignments"
    )
    assignment_column = "community_id" if is_community_map else "zone"
    comment_dicts: list[CommentDict] | None = (
        [
            CommentDict(comment_id=c.comment_id, zone=c.zone, text=c.text)
            for c in data.comments
        ]
        if data.comments is not None
        else None
    )

    if VERBOSE_LOGGING:
        logger.info(
            f"PUT /api/assignments: document_id={document_id}, "
            f"requested_map_type={requested_map_type}, "
            f"actual_map_type={actual_map_type}, "
            f"assignment_count={len(assignments)}, "
            f"comment_count={len(data.comments) if data.comments else 0}, "
            f"has_metadata={data.metadata is not None}, "
            f"has_community_metadata_list="
            f"{data.metadata is not None and data.metadata.community_metadata_list is not None}, "
            f"num_communities={data.metadata.num_communities if data.metadata else None}"
        )

    # Validate community payload (name sanitization, length) before any mutations.
    # Returns normalized metadata list if provided, else None.
    validated_community_metadata = None
    if is_community_map:
        if VERBOSE_LOGGING:
            logger.info(
                f"Community save validation for document {document_id}: "
                f"incoming_comments={comment_dicts}"
            )
        validated_community_metadata = _validate_community_save_payload(
            metadata=data.metadata,
        )
        if VERBOSE_LOGGING:
            logger.info(
                f"Community save validation passed for document {document_id}, "
                f"validated_metadata={'present' if validated_community_metadata else 'None'}"
            )

    db_last_updated_at = session.exec(
        select(Document.updated_at).where(Document.document_id == document_id)
    ).one_or_none()

    if (
        db_last_updated_at is not None
        and db_last_updated_at > last_updated_at
        and not data.overwrite
    ):
        if VERBOSE_LOGGING:
            logger.warning(
                f"Conflict detected for document {document_id}: "
                f"db_last_updated_at={db_last_updated_at!r} > last_updated_at={last_updated_at!r}"
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document has been updated since the last update",
        )
    # Track whether anything actually changed so we can skip the updated_at bump on
    # true no-op requests (which would otherwise break optimistic concurrency for
    # other clients).
    mutated = False

    # The assignments field is always a full replacement set:
    #   [] means "delete all assignments" (user cleared everything)
    #   [...] means "replace with these assignments"
    # Always DELETE existing rows, then INSERT new ones if any.
    delete_result = session.connection().execute(
        text(f"DELETE FROM {assignment_table} WHERE document_id = :document_id"),
        {"document_id": document_id},
    )
    if delete_result.rowcount and delete_result.rowcount > 0:
        mutated = True
    inserted_count = 0
    if has_assignments:
        # For community maps, build the set of valid community_ids so we can reject
        # orphan-producing writes before they hit the partition. 0 is the "unassigned"
        # sentinel; positive ids must exist in the effective metadata list. Skip the
        # check entirely when no metadata has been established yet (either in this
        # request or previously persisted) — that's the bootstrap path where the UI
        # writes assignments before the metadata save lands.
        valid_community_ids: set[int] | None = None
        if is_community_map:
            if validated_community_metadata is not None:
                effective_metadata = validated_community_metadata
            else:
                effective_metadata = _load_existing_community_metadata(
                    session, document_id
                )
            if effective_metadata:
                valid_community_ids = {c.id for c in effective_metadata} | {0}

        # Use COPY for faster bulk insert with partitioned tables
        # Create a temporary table for bulk loading
        load_id, _ = str(uuid4()).split("-", maxsplit=1)
        temp_table_name = f"temp_assignments_{load_id}"
        session.connection().execute(
            text(
                f"CREATE TEMP TABLE {temp_table_name} (document_id UUID, geo_id TEXT, zone INT)"
            )
        )

        # Use COPY to bulk load data into temp table
        cursor = session.connection().connection.cursor()
        with cursor.copy(
            f"COPY {temp_table_name} (document_id, geo_id, zone) FROM STDIN"
        ) as copy:
            for assignment in assignments:
                # assignment is [geo_id, zone]
                geo_id = assignment[0]
                zone_val = assignment[1] if len(assignment) > 1 else None
                if is_community_map and zone_val is None:
                    zone_val = 0
                if (
                    valid_community_ids is not None
                    and zone_val not in valid_community_ids
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Assignment references unknown community_id {zone_val!r}; "
                            "it is not in the document's community metadata list."
                        ),
                    )
                copy.write_row([document_id, geo_id, zone_val])

        # Insert from temp table into partitioned assignments table
        # PostgreSQL will automatically route to the correct partition based on document_id
        inserted_count = (
            session.connection()
            .execute(
                text(f"""
            INSERT INTO {assignment_table} (document_id, geo_id, {assignment_column})
            SELECT document_id, geo_id, zone
            FROM {temp_table_name}
            """),
            )
            .rowcount
        )
        if inserted_count and inserted_count > 0:
            mutated = True
        if VERBOSE_LOGGING:
            logger.info(
                f"Inserted {inserted_count} {'community' if is_community_map else ''} "
                f"assignments to document {document_id}"
            )

    # Update num_districts if provided
    if data.metadata is not None:
        if data.metadata.num_districts is not None:
            # Reject if map has num_districts_modifiable=False
            districtr_map = session.exec(
                select(DistrictrMap)
                .join(
                    Document,
                    col(Document.districtr_map_slug)
                    == col(DistrictrMap.districtr_map_slug),
                )
                .where(Document.document_id == document_id)
            ).first()
            if districtr_map and not getattr(
                districtr_map, "num_districts_modifiable", True
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Number of districts is not modifiable for this map",
                )
            if data.metadata.num_districts < 2 or data.metadata.num_districts > 538:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Number of districts must be at least 2 and at most 538",
                )
            stmt = text("""UPDATE document.document
                SET num_districts = :num_districts
                WHERE document_id = :document_id""").bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="num_districts", type_=Integer),
            )
            session.connection().execute(
                stmt,
                {
                    "document_id": document_id,
                    "num_districts": data.metadata.num_districts,
                },
            )

        if data.metadata.color_scheme is not None:
            stmt = text("""UPDATE document.document
                SET color_scheme = :colors
                WHERE document_id = :document_id""").bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="colors", type_=ARRAY(String)),
            )
            session.connection().execute(
                stmt, {"document_id": document_id, "colors": data.metadata.color_scheme}
            )

        if data.metadata.num_communities is not None:
            stmt = text("""UPDATE document.document
                SET num_communities = :num_communities
                WHERE document_id = :document_id""").bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="num_communities", type_=Integer),
            )
            session.connection().execute(
                stmt,
                {
                    "document_id": document_id,
                    "num_communities": data.metadata.num_communities,
                },
            )

        if data.metadata.community_metadata_list is not None:
            metadata_to_save = (
                validated_community_metadata
                if validated_community_metadata is not None
                else data.metadata.community_metadata_list
            )
            stmt = (
                update(Document)
                .where(col(Document.document_id) == document_id)
                .values(
                    community_metadata_list=[
                        (
                            community.model_dump()
                            if hasattr(community, "model_dump")
                            else community
                        )
                        for community in metadata_to_save
                    ]
                )
            )
            session.connection().execute(
                stmt,
            )

    if data.metadata is not None and (
        data.metadata.num_districts is not None
        or data.metadata.color_scheme is not None
        or data.metadata.num_communities is not None
        or data.metadata.community_metadata_list is not None
    ):
        mutated = True

    # Sync scoped comments via comments schema (None = no change, [] = delete all)
    if data.comments is not None:
        comment_inputs: list[DistrictCommentInput] = []
        for c in data.comments:
            if c.zone is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each comment must specify a zone (int).",
                )
            comment_inputs.append(
                DistrictCommentInput(comment_id=c.comment_id, zone=c.zone, text=c.text)
            )
        if VERBOSE_LOGGING:
            logger.info(
                f"Syncing {'community' if is_community_map else 'district'} comments "
                f"for document {document_id}: {len(comment_inputs)} comments"
            )
        sync_fn = (
            sync_community_comments if is_community_map else sync_district_comments
        )
        sync_fn(
            document_id=document_id,
            comments=comment_inputs if len(data.comments) > 0 else [],
            session=session,
            background_tasks=background_tasks,
        )
        # sync_fn always hits the DB (delete/insert/update), so count it.
        mutated = True

    if mutated:
        updated_at = update_timestamp(session, document_id)
    else:
        # No-op request (e.g. assignments=[] on an already-empty doc with no metadata
        # or comment changes). Keep updated_at pinned to its current value so other
        # clients' optimistic-concurrency windows aren't invalidated.
        updated_at = session.exec(
            select(Document.updated_at).where(Document.document_id == document_id)
        ).one()
    session.commit()
    if VERBOSE_LOGGING:
        logger.info(
            f"PUT /api/assignments complete: document_id={document_id}, "
            f"assignments_inserted={inserted_count}, updated_at={updated_at}"
        )
    return {"assignments_inserted": inserted_count, "updated_at": updated_at}


@app.get(
    "/api/gerrydb/edges/{districtr_map_slug}",
    response_model=list[ShatterResult],
)
async def get_children(
    districtr_map_slug: str,
    parent_geoid: list[str] = Query(default=[]),
    session: Session = Depends(get_session),
):
    db_districtr_map_uuid = (
        session.connection()
        .execute(
            select(DistrictrMap.uuid).where(
                DistrictrMap.districtr_map_slug == districtr_map_slug
            )
        )
        .scalar_one()
    )
    stmt = text("""SELECT child_path, parent_path
        FROM parentchildedges pce
        WHERE pce.parent_path = ANY(:parent_geoids)
        AND pce.districtr_map = :districtr_map_uuid""").bindparams(
        bindparam(key="districtr_map_uuid", type_=UUIDType),
        bindparam(key="parent_geoids", type_=ARRAY(String)),
    )
    results = (
        session.connection()
        .execute(
            stmt,
            {
                "districtr_map_uuid": db_districtr_map_uuid,
                "parent_geoids": parent_geoid,
            },
        )
        .fetchall()
    )
    return results


@app.patch("/api/assignments/{document_id}/reset", status_code=status.HTTP_200_OK)
async def reset_map(
    document: Annotated[Document, Depends(get_document)],
    session: Session = Depends(get_session),
):
    reset_document_partition(session, document.document_id, "assignments")
    reset_document_partition(session, document.document_id, "community_assignments")

    # Reset color scheme
    stmt = text(
        "UPDATE document.document SET color_scheme = NULL WHERE document_id = :document_id"
    ).bindparams(bindparam(key="document_id", type_=UUIDType))
    session.connection().execute(
        stmt,
        {"document_id": document.document_id},
    )

    session.commit()

    return {
        "message": "Assignments partition reset",
        "document_id": document.document_id,
    }


@app.patch(
    "/api/document/{document_id}/update_colors",
    response_model=ColorsSetResult,
)
async def update_colors(
    colors: list[str],
    document: Annotated[Document, Depends(get_document)],
    session: Session = Depends(get_session),
):
    # Get num_districts from Document, with fallback to DistrictrMap
    districtr_map = session.exec(
        select(DistrictrMap).where(
            DistrictrMap.districtr_map_slug == document.districtr_map_slug
        )
    ).one()

    num_districts = document.num_districts or districtr_map.num_districts

    if num_districts is not None and num_districts != len(colors):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Number of colors provided ({len(colors)}) does not match number of zones ({num_districts})",
        )

    stmt = text("""UPDATE document.document
        SET color_scheme = :colors
        WHERE document_id = :document_id""").bindparams(
        bindparam(key="document_id", type_=UUIDType),
        bindparam(key="colors", type_=ARRAY(String)),
    )
    session.connection().execute(
        stmt, {"document_id": document.document_id, "colors": colors}
    )
    session.commit()
    return ColorsSetResult(colors=colors)


@app.put(
    "/api/document/{document_id}/num_districts",
    response_model=NumDistrictsSetResult,
)
async def update_num_districts(
    num_districts: int,
    document: Annotated[Document, Depends(get_document)],
    session: Session = Depends(get_session),
):
    if num_districts < 2 or num_districts > 538:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Number of districts must be at least 2 and at most 538",
        )

    districtr_map = session.exec(
        select(DistrictrMap).where(
            DistrictrMap.districtr_map_slug == document.districtr_map_slug
        )
    ).first()
    if districtr_map and not getattr(districtr_map, "num_districts_modifiable", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Number of districts is not modifiable for this map",
        )

    stmt = text("""UPDATE document.document
        SET num_districts = :num_districts
        WHERE document_id = :document_id""").bindparams(
        bindparam(key="document_id", type_=UUIDType),
        bindparam(key="num_districts", type_=Integer),
    )
    session.connection().execute(
        stmt, {"document_id": document.document_id, "num_districts": num_districts}
    )
    session.commit()
    return NumDistrictsSetResult(num_districts=num_districts)


# called by getAssignments in apiHandlers.ts
@app.get("/api/get_assignments/{document_id}", response_model=list[AssignmentsResponse])
async def get_assignments(
    document: Annotated[Document, Depends(get_protected_document)],
    session: Session = Depends(get_session),
):
    districtr_map_uuid, map_type = session.exec(
        select(DistrictrMap.uuid, Document.map_type)
        .join(
            Document,
            onclause=col(Document.districtr_map_slug)
            == DistrictrMap.districtr_map_slug,
        )
        .where(Document.document_id == document.document_id)
    ).one()
    is_community_map = map_type == "community"

    if is_community_map:
        stmt = (
            select(
                CommunityAssignments.geo_id,
                func.nullif(CommunityAssignments.community_id, 0).label("zone"),
                ParentChildEdges.parent_path,
            )
            .outerjoin(
                ParentChildEdges,
                onclause=(
                    col(CommunityAssignments.geo_id) == ParentChildEdges.child_path
                )
                & (col(ParentChildEdges.districtr_map) == districtr_map_uuid),
            )
            .where(CommunityAssignments.document_id == document.document_id)
        )
    else:
        stmt = (
            select(
                Assignments.geo_id,
                Assignments.zone,
                ParentChildEdges.parent_path,
            )
            .outerjoin(
                ParentChildEdges,
                onclause=(col(Assignments.geo_id) == ParentChildEdges.child_path)
                & (col(ParentChildEdges.districtr_map) == districtr_map_uuid),
            )
            .where(Assignments.document_id == document.document_id)
        )
    results = session.exec(stmt).all()
    if VERBOSE_LOGGING:
        logger.info(
            f"GET /api/get_assignments/{document.document_id}: "
            f"is_community_map={is_community_map}, "
            f"assignment_count={len(results)}, "
            f"sample_zones={[r.zone for r in results[:5]]}"
        )
    return results


@app.get("/api/document/{document_id}", response_model=DocumentPublic)
async def get_document_object(
    document_id: DocumentID = Depends(parse_document_id),
    session: Session = Depends(get_session),
):
    try:
        return get_document_public(document_id=document_id, session=session)
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {document_id}",
        )
    except MultipleResultsFound:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Multiple documents found for ID: {document_id}",
        )


@app.get("/api/documents/list")
async def get_document_list(
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
    ids: list[int] = Query(default=[]),
    tags: list[str] = Query(default=[]),
):
    stmt = (
        select(  # type: ignore[no-matching-overload]
            Document.public_id,
            Document.map_metadata,
            Document.updated_at,
            Document.document_type,
            col(DistrictrMap.name).label("map_module"),
        )
        .distinct(
            Document.public_id,
        )
        .join(
            DistrictrMap,
            col(Document.districtr_map_slug) == col(DistrictrMap.districtr_map_slug),
            isouter=True,
        )
        .offset(offset)
        .limit(limit)
    )

    if len(tags) > 0:
        stmt = (
            stmt.join(
                FormDocumentComment,
                FormDocumentComment.document_id == Document.document_id,
            )
            .join(
                CommentTag,
                CommentTag.comment_id == FormDocumentComment.comment_id,
            )
            .join(
                Tag,
                Tag.id == CommentTag.tag_id,
            )
            .where(
                col(Tag.slug).in_(tags),
            )
            .where(
                # this is fine to keep as ->> because you're comparing to text
                col(Document.map_metadata)["draft_status"].astext == "ready_to_share"
            )
        )

    if len(ids) > 0:
        stmt = stmt.where(col(Document.public_id).in_(ids))

    results = session.exec(stmt).all()
    return [
        {
            "public_id": row[0],
            "map_metadata": row[1],
            "updated_at": row[2],
            "document_type": row[3],
            "map_module": row[4],
        }
        for row in results
    ]


@app.get("/api/document/{document_id}/unassigned", response_model=BBoxGeoJSONs)
async def get_unassigned_geoids(
    document: Annotated[Document, Depends(get_protected_document)],
    exclude_ids: list[str] = Query(default=[]),
    session: Session = Depends(get_session),
):
    stmt = text(
        "SELECT bbox from get_unassigned_bboxes(:doc_uuid, :exclude_ids)"
    ).bindparams(
        bindparam(key="doc_uuid", type_=UUIDType),
        bindparam(key="exclude_ids", type_=ARRAY(String)),
    )
    try:
        results = (
            session.connection()
            .execute(
                stmt, {"doc_uuid": document.document_id, "exclude_ids": exclude_ids}
            )
            .fetchall()
        )
    except DataError:
        # TODO: When is this happening? Should investigate
        logger.warning("No results found for unassigned geoids")
        results = []

    return {"features": [row[0] for row in results if row[0] is not None]}


async def _get_graph(gerrydb_name: str) -> Graph:
    """
    Get a graph from the cache or load it from a local file or S3.
    - If cached, return it
    - If not cached, download it to the VM if not already downloaded and cache it

    Args:
        gerrydb_name (str): The name of the GerryDB to get the graph for.

    Returns:
        Graph: The graph for the given GerryDB.
    """
    try:
        path = contiguity.get_gerrydb_graph_file(gerrydb_name)
    except botocore.exceptions.ClientError as e:
        # TODO: Maybe in the future this should actually create the graph
        logger.error(f"Graph not found: {str(e)}")
        raise HTTPException(
            status_code=404,
            detail="Graph unavailable. This map does not support contiguity checks.",
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Something went wrong: {str(e)}")

    G = await cache.get(gerrydb_name)

    try:
        if G is None:
            logger.info(f"Graph not found in cache, loading from {path}")
            G = contiguity.get_gerrydb_block_graph(path, replace_local_copy=False)
            assert await cache.set(gerrydb_name, G), "Unable to cache graph"
        else:
            logger.info("Graph found in cache")
    except Exception as e:
        logger.warning(f"Unable to load and cache graph: {str(e)}")

    if not isinstance(G, Graph):
        logger.error(f"Expected Graph, got {type(G)}")
        raise HTTPException(status_code=500, detail="Error loading graph")

    return G


@app.get("/api/document/{document_id}/contiguity")
async def check_document_contiguity(
    document: Annotated[Document, Depends(get_protected_document)],
    zone: list[int] = Query(default=[]),
    session: Session = Depends(get_session),
):
    if document.map_type == "community":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contiguity checks are not supported for community maps",
        )

    districtr_map = get_districtr_map(
        document_id=DocumentID(document_id=document.document_id), session=session
    )

    if districtr_map.child_layer is not None:
        logger.info(
            f"Using child layer {districtr_map.child_layer} for document {document.document_id}"
        )
        gerrydb_name = districtr_map.child_layer
        kwargs = {"zones": zone} if len(zone) > 0 else {}
        zone_assignments = contiguity.get_block_assignments(
            session, document.document_id, **kwargs
        )
    else:
        gerrydb_name = districtr_map.parent_layer
        logger.info(
            f"No child layer configured for document. Defauling to parent layer {gerrydb_name} for document {document.document_id}"
        )
        sql = text("""
            SELECT
                zone,
                array_agg(geo_id) as nodes
            FROM
                document.assignments
            WHERE
                document_id = :document_id
                AND zone IS NOT NULL
            GROUP BY
                zone""")
        result = (
            session.connection()
            .execute(sql, {"document_id": document.document_id})
            .fetchall()
        )
        zone_assignments = [
            contiguity.ZoneBlockNodes(zone=row.zone, nodes=row.nodes) for row in result
        ]

    G = await _get_graph(gerrydb_name)

    results = {}
    for zone_blocks in zone_assignments:
        logger.info(f"Checking contiguity for zone {zone_blocks.zone}")
        results[zone_blocks.zone] = contiguity.subgraph_number_connected_components(
            G=G, subgraph_nodes=zone_blocks.nodes
        )

    return results


@app.get("/api/document/{document_id}/contiguity/{zone}/connected_component_bboxes")
async def get_connected_component_bboxes(
    zone: int,
    document: Annotated[Document, Depends(get_protected_document)],
    session: Session = Depends(get_session),
):
    if document.map_type == "community":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contiguity checks are not supported for community maps",
        )

    districtr_map = get_districtr_map(
        document_id=DocumentID(document_id=document.document_id), session=session
    )
    if districtr_map.child_layer is not None:
        logger.info(
            f"Using child layer {districtr_map.child_layer} for document {document.document_id}"
        )
        gerrydb_name = districtr_map.child_layer
        zone_assignments = contiguity.get_block_assignments_bboxes(
            session, document.document_id, zones=[zone]
        )
        if len(zone_assignments) == 0:
            raise HTTPException(status_code=404, detail="Zone not found")
        elif len(zone_assignments) > 1:
            raise HTTPException(status_code=500, detail="Multiple zones found")
        zone_assignments = zone_assignments[0]
    else:
        gerrydb_name = districtr_map.parent_layer
        logger.info(
            f"No child layer configured for document. Defauling to parent layer {gerrydb_name} for document {document.document_id}"
        )
        sql = text(f"""
            SELECT
                geo_id,
                st_xmin(box2d(gpd.geometry)) AS xmin,
                st_xmax(box2d(gpd.geometry)) AS xmax,
                st_ymin(box2d(gpd.geometry)) AS ymin,
                st_ymax(box2d(gpd.geometry)) AS ymax
            FROM
                document.assignments a
            LEFT JOIN
                gerrydb.{gerrydb_name} gpd
                ON a.geo_id = gpd.path
            WHERE
                document_id = :document_id
                AND zone = :zone""")

        results = (
            session.connection()
            .execute(sql, {"document_id": document.document_id, "zone": zone})
            .all()
        )

        if not results or len(results) == 0:
            raise HTTPException(status_code=404, detail="Zone not found")
        nodes = [row.geo_id for row in results]
        zone_assignments = contiguity.ZoneBlockNodes(
            zone=zone,
            nodes=list(nodes),
            node_data={
                row.geo_id: {
                    "xmin": row.xmin,
                    "xmax": row.xmax,
                    "ymin": row.ymin,
                    "ymax": row.ymax,
                }
                for row in results
            },
        )

    G = await _get_graph(gerrydb_name)
    subgraph = G.subgraph(nodes=zone_assignments.nodes)

    if zone_assignments.node_data is None:
        raise HTTPException(status_code=404, detail="Node data is missing")

    zone_connected_components = connected_components(subgraph)

    from_srid = (
        session.connection()
        .execute(
            text("""SELECT srid
                FROM geometry_columns
                WHERE f_table_name = :table_name
                    AND f_table_schema = 'gerrydb'
                LIMIT 1"""),
            {"table_name": gerrydb_name},
        )
        .scalar()
    )

    bboxes = []
    for zone_connected_component in zone_connected_components:
        minx, miny, maxx, maxy = (
            float("inf"),
            float("inf"),
            float("-inf"),
            float("-inf"),
        )
        for node in zone_connected_component:
            node_data = zone_assignments.node_data[node]
            minx = min(minx, node_data["xmin"])
            miny = min(miny, node_data["ymin"])
            maxx = max(maxx, node_data["xmax"])
            maxy = max(maxy, node_data["ymax"])

        (_minx, _maxx), (_miny, _maxy) = transform(
            xs=[minx, maxx],
            ys=[miny, maxy],
            src_crs=f"EPSG:{from_srid}",
            dst_crs="EPSG:4326",
        )

        bboxes.append(
            PolygonModel(
                coordinates=[
                    [
                        Coordinates(lon=_minx, lat=_miny),
                        Coordinates(lon=_maxx, lat=_miny),
                        Coordinates(lon=_maxx, lat=_maxy),
                        Coordinates(lon=_minx, lat=_maxy),
                        Coordinates(lon=_minx, lat=_miny),
                    ]
                ]
            )
        )

    return BBoxGeoJSONs(features=bboxes)


@app.put("/api/document/{document_id}/metadata", status_code=status.HTTP_200_OK)
async def update_districtrmap_metadata(
    metadata: DocumentMetadata,
    document: Document = Depends(get_document),
    session: Session = Depends(get_session),
):
    try:
        stmt = (
            update(Document)
            .where(Document.document_id == document.document_id)  # type: ignore
            .values(map_metadata=metadata.model_dump(exclude_unset=True))
        )
        session.connection().execute(stmt)
        session.commit()

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        )


@app.get(
    "/api/gerrydb/views",
    #  response_model=list[DistrictrMapPublic]
)
async def get_projects(
    session: Session = Depends(get_session),
    group: str = Query(default="states"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=1000),
):
    gerrydb_views = session.exec(
        select(DistrictrMap)
        .join(
            DistrictrMapsToGroups,
            col(DistrictrMapsToGroups.districtrmap_uuid) == DistrictrMap.uuid,
        )
        .filter(col(DistrictrMapsToGroups.group_slug) == group)
        .filter(col(DistrictrMap.visible) == true())
        .order_by(col(DistrictrMap.name).asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return gerrydb_views


@app.get("/api/group/{group_slug}", response_model=MapGroup)
async def get_group(
    *,
    session: Session = Depends(get_session),
    group_slug: str,
):
    stmt = select(
        MapGroup,
    ).where(
        MapGroup.slug == group_slug,
    )
    group = session.exec(stmt).first()

    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Group matching {group_slug} does not exist.",
        )
    return {
        "name": group.name,
        "slug": group.slug,
    }
