from fastapi import (
    FastAPI,
    status,
    Depends,
    HTTPException,
    Query,
    BackgroundTasks,
    Body,
    Form,
    Security,
)
from fastapi.responses import RedirectResponse
from typing import Annotated
import botocore.exceptions
from sqlalchemy.exc import MultipleResultsFound, NoResultFound, DataError
from fastapi.responses import FileResponse
from sqlalchemy import text, update
from sqlmodel import Session, String, select, true
from sqlalchemy.sql.functions import coalesce
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert
import logging
from sqlalchemy import bindparam, literal
from sqlmodel import ARRAY, INT
from datetime import datetime, UTC, timedelta
import sentry_sdk
from fastapi_utils.tasks import repeat_every
from app.core.db import get_session
from app.core.config import settings
from app.core.security import auth, TokenScope
from app.core.thumbnails import generate_thumbnail, thumbnail_exists
from app.utils import hash_password, verify_password
import jwt
from uuid import uuid4
import app.contiguity.main as contiguity
import app.cms.main as cms
from networkx import Graph, connected_components
from app.models import (
    Assignments,
    AssignmentsResponse,
    ColorsSetResult,
    DistrictrMap,
    Document,
    DocumentCreate,
    DocumentPublic,
    DocumentEditStatus,
    GEOIDS,
    UserID,
    GEOIDSResponse,
    AssignedGEOIDS,
    UUIDType,
    DistrictrMapPublic,
    ParentChildEdges,
    ShatterResult,
    TokenRequest,
    DocumentShareStatus,
    BBoxGeoJSONs,
)
from pydantic_geojson import PolygonModel
from pydantic_geojson._base import Coordinates
from sqlalchemy.sql import func
from app.utils import remove_file, _cleanup_expired_locks, _remove_all_locks
from app.exports import (
    get_export_sql_method,
    DocumentExportType,
    DocumentExportFormat,
)
from aiocache import Cache
from contextlib import asynccontextmanager
from fiona.transform import transform


if settings.ENVIRONMENT in ("production", "qa"):
    sentry_sdk.init(
        dsn="https://b14aae02017e3a9c425de4b22af7dd0c@o4507623009091584.ingest.us.sentry.io/4507623009746944",
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
        environment=settings.ENVIRONMENT.value,
    )


@repeat_every(seconds=60)
async def cleanup_expired_locks():
    session = next(get_session())
    _cleanup_expired_locks(session=session, hours=1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await cleanup_expired_locks()
    yield
    session = next(get_session())
    _remove_all_locks(session=session)


app = FastAPI(lifespan=lifespan)

# Include the CMS router
app.include_router(cms.router)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

cache = Cache(cache_class=Cache.MEMORY)


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
        .where(Document.document_id == document_id)
        .values(updated_at=func.now())
        .returning(Document.updated_at)
    )  # pyright: ignore
    updated_at = session.scalar(update_stmt)
    return updated_at


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/db_is_alive")
async def db_is_alive(session: Session = Depends(get_session)):
    try:
        session.execute(text("SELECT 1"))
        return {"message": "DB is alive"}
    except Exception as e:
        logger.error(e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DB is unreachable"
        )


def check_map_lock(document_id, user_id, session):
    # Try to fetch an existing lock for this document
    result = session.execute(
        text(
            """SELECT user_id FROM document.map_document_user_session
               WHERE document_id = :document_id
               LIMIT 1;"""
        ),
        {"document_id": document_id},
    ).fetchone()

    if result:
        # If a record exists, check if the current user is the one who locked it
        if result.user_id == user_id:
            return DocumentEditStatus.checked_out
        else:
            return DocumentEditStatus.locked

    # If no record exists, insert a new one and return checked_out
    session.execute(
        text(
            """INSERT INTO document.map_document_user_session (document_id, user_id)
               VALUES (:document_id, :user_id);"""
        ),
        {"document_id": document_id, "user_id": user_id},
    )
    session.commit()
    return DocumentEditStatus.checked_out


@app.post("/api/document/{document_id}/unload", status_code=status.HTTP_200_OK)
async def unlock_map(
    document_id: str, user_id: str = Form(...), session: Session = Depends(get_session)
):
    """
    unlock map when tab is unloaded
    """
    try:
        session.execute(
            text(
                """DELETE FROM document.map_document_user_session
                WHERE document_id = :document_id AND user_id = :user_id"""
            ).bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="user_id", type_=String),
            ),
            {"document_id": document_id, "user_id": user_id},
        )
        session.commit()
        return {"status": DocumentEditStatus.unlocked}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# matches createMapObject in apiHandlers.ts
@app.post(
    "/api/create_document",
    response_model=DocumentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_document(
    data: DocumentCreate, session: Session = Depends(get_session)
):
    # try:
    results = session.execute(
        text("SELECT create_document(:districtr_map_slug);"),
        {"districtr_map_slug": data.districtr_map_slug},
    )
    plan_genesis = "created"
    document_id = results.one()[0]  # should be only one row, one column of results

    lock_status = check_map_lock(
        document_id, data.user_id, session
    )  # this will properly create a lock record

    copy_from_doc = getattr(data, "copy_from_doc", None)

    # if copy from doc, need to get assignments from that document, copy them for the new doc
    if copy_from_doc:
        prev_assignments = Assignments.__table__.select().where(
            Assignments.document_id == copy_from_doc
        )
        # create a new copy with the fresh document id
        # set document id to new document id
        prev_assignments = select(
            Assignments.geo_id,
            Assignments.zone,
            literal(document_id).label("document_id"),
        ).where(Assignments.document_id == copy_from_doc)

        create_copy_stmt = insert(Assignments).from_select(
            ["geo_id", "zone", "document_id"], prev_assignments
        )

        session.execute(create_copy_stmt)
        plan_genesis = "copied"

    # check if there is a metadata item in the request
    if data.metadata:
        update_districtrmap_metadata(document_id, data.metadata.dict(), session)

    stmt = (
        select(
            Document.document_id,
            Document.created_at,
            Document.districtr_map_slug,
            Document.gerrydb_table,
            Document.updated_at,
            DistrictrMap.uuid.label("map_uuid"),  # pyright: ignore
            DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
            DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
            DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
            DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
            DistrictrMap.extent.label("extent"),  # pyright: ignore
            coalesce(plan_genesis).label("genesis"),
            # send metadata as a null object on init of document
            coalesce(
                None,
            ).label("map_metadata"),
            coalesce(
                None,
                lock_status,
            ).label("status"),
        )
        .where(Document.document_id == document_id)
        .join(
            DistrictrMap,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
            isouter=True,
        )
        .limit(1)
    )
    # Document id has a unique constraint so I'm not sure we need to hit the DB again here
    # more valuable would be to check that the assignments table
    doc = session.exec(
        stmt,
    ).one()  # again if we've got more than one, we have problems.
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


@app.patch("/api/update_assignments")
async def update_assignments(
    data: dict = Body(...), session: Session = Depends(get_session)
):
    # todo: type the input instead of dict
    assignments = data["assignments"]
    document_id = assignments[0]["document_id"]
    lock_status = check_map_lock(document_id, data["user_id"], session)

    if lock_status == DocumentEditStatus.checked_out:
        stmt = insert(Assignments).values(assignments)
        stmt = stmt.on_conflict_do_update(
            constraint=Assignments.__table__.primary_key,
            set_={"zone": stmt.excluded.zone},
        )
        session.execute(stmt)
        updated_at = None
        if len(assignments) > 0:
            updated_at = update_timestamp(session, document_id)
        session.commit()
        return {
            "assignments_upserted": len(assignments),
            "updated_at": data["updated_at"],
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document is locked by another user",
        )


def _get_document(
    document_id: str, session: Session = Depends(get_session)
) -> Document:
    try:
        document = session.exec(
            select(Document).filter(Document.document_id == document_id)  # pyright: ignore
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error loading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error loading document")

    return document


@app.patch(
    "/api/update_assignments/{document_id}/shatter_parents",
    response_model=ShatterResult,
)
async def shatter_parent(
    document: Annotated[Document, Depends(_get_document)],
    data: GEOIDS,
    session: Session = Depends(get_session),
):
    assert document.document_id is not None
    stmt = text(
        """SELECT *
        FROM shatter_parent(:input_document_id, :parent_geoids)"""
    ).bindparams(
        bindparam(key="input_document_id", type_=UUIDType),
        bindparam(key="parent_geoids", type_=ARRAY(String)),
    )
    results = session.execute(
        statement=stmt,
        params={
            "input_document_id": document.document_id,
            "parent_geoids": data.geoids,
        },
    )
    # :( was getting validation errors so am just going to loop
    assignments = [
        Assignments(document_id=str(document_id), geo_id=geo_id, zone=zone)
        for document_id, geo_id, zone in results
    ]
    updated_at = update_timestamp(session, document.document_id)
    result = ShatterResult(parents=data, children=assignments, updated_at=updated_at)
    session.commit()
    return result


@app.patch(
    "/api/update_assignments/{document_id}/unshatter_parents",
    response_model=GEOIDSResponse,
)
async def unshatter_parent(
    document: Annotated[Document, Depends(_get_document)],
    data: AssignedGEOIDS,
    session: Session = Depends(get_session),
):
    stmt = text(
        """SELECT *
        FROM unshatter_parent(:input_document_id, :parent_geoids, :input_zone)"""
    ).bindparams(
        bindparam(key="input_document_id", type_=UUIDType),
        bindparam(key="parent_geoids", type_=ARRAY(String)),
        bindparam(key="input_zone", type_=INT),
    )
    results = session.execute(
        statement=stmt,
        params={
            "input_document_id": document.document_id,
            "parent_geoids": data.geoids,
            "input_zone": data.zone,
        },
    ).first()

    assert (
        results is not None and document.document_id is not None
    ), "No results returned from unshatter_parent"
    updated_at = update_timestamp(session, document.document_id)
    session.commit()

    if results is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to unshatter parent",
        )

    return {"geoids": results[0], "updated_at": updated_at}


@app.patch(
    "/api/update_assignments/{document_id}/reset", status_code=status.HTTP_200_OK
)
async def reset_map(
    document: Annotated[Document, Depends(_get_document)],
    session: Session = Depends(get_session),
):
    partition_name = f'"document.assignments_{document.document_id}"'
    session.execute(text(f"DROP TABLE IF EXISTS {partition_name} CASCADE;"))

    # Recreate the partition
    stmt = text(
        f"""CREATE TABLE {partition_name}
        PARTITION OF document.assignments
        FOR VALUES IN ('{document.document_id}');
    """
    )
    session.execute(stmt)

    # Reset color scheme
    stmt = text(
        "UPDATE document.document SET color_scheme = NULL WHERE document_id = :document_id"
    ).bindparams(bindparam(key="document_id", type_=UUIDType))
    session.execute(
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
    document_id: str, colors: list[str], session: Session = Depends(get_session)
):
    districtr_map = session.exec(
        select(DistrictrMap)
        .join(
            Document,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,  # pyright: ignore
            isouter=True,
        )
        .where(Document.document_id == document_id)
    ).one()

    if districtr_map.num_districts != len(colors):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Number of colors provided ({len(colors)}) does not match number of zones ({districtr_map.num_districts})",
        )

    stmt = text(
        """UPDATE document.document
        SET color_scheme = :colors
        WHERE document_id = :document_id"""
    ).bindparams(
        bindparam(key="document_id", type_=UUIDType),
        bindparam(key="colors", type_=ARRAY(String)),
    )
    session.execute(stmt, {"document_id": document_id, "colors": colors})
    session.commit()
    return ColorsSetResult(colors=colors)


# called by getAssignments in apiHandlers.ts
@app.get("/api/get_assignments/{document_id}", response_model=list[AssignmentsResponse])
async def get_assignments(
    document: Annotated[Document, Depends(_get_document)],
    session: Session = Depends(get_session),
):
    stmt = (
        select(
            Assignments.geo_id,
            Assignments.zone,
            Assignments.document_id,
            ParentChildEdges.parent_path,
        )
        .join(Document, Assignments.document_id == Document.document_id)
        .join(
            DistrictrMap, Document.districtr_map_slug == DistrictrMap.districtr_map_slug
        )
        .outerjoin(
            ParentChildEdges,
            (Assignments.geo_id == ParentChildEdges.child_path)
            & (ParentChildEdges.districtr_map == DistrictrMap.uuid),
        )
        .where(Assignments.document_id == document.document_id)
    )

    return session.execute(stmt).fetchall()


async def get_document(
    document_id: str,
    user_id: UserID,
    session: Session,
    shared: bool = False,
    access_type: DocumentShareStatus = DocumentShareStatus.edit,
    # optional lock status param
    lock_status: DocumentEditStatus | None = None,
):
    # TODO: Rather than being a separate query, this should be part of the main query
    check_lock_status = (
        check_map_lock(document_id, user_id, session)
        if not lock_status == DocumentEditStatus.locked
        else lock_status
    )

    stmt = (
        select(
            Document.document_id,
            Document.created_at,
            Document.districtr_map_slug,
            Document.gerrydb_table,
            Document.updated_at,
            Document.color_scheme,
            DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
            DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
            DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
            DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
            DistrictrMap.extent.label("extent"),  # pyright: ignore
            # get metadata as a json object
            Document.map_metadata.label("map_metadata"),  # pyright: ignore
            coalesce(
                "shared" if shared else "created",
            ).label("genesis"),
            coalesce(
                check_lock_status,  # locked, unlocked, checked_out
            ).label("status"),
            coalesce(
                access_type,
            ).label("access"),  # read or edit
            # add access - read or edit
        )  # pyright: ignore
        .where(Document.document_id == document_id)
        .join(
            DistrictrMap,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
            isouter=True,
        )
    )
    result = session.exec(stmt)

    try:
        return result.one()
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


@app.post("/api/document/{document_id}", response_model=DocumentPublic)
async def get_document_object(
    document_id: str,
    data: UserID = Body(...),
    session: Session = Depends(get_session),
    status_code=status.HTTP_200_OK,
):
    return await get_document(document_id, data.user_id, session)


@app.post("/api/document/{document_id}/unlock")
async def unlock_document(
    document_id: str, data: UserID = Body(...), session: Session = Depends(get_session)
):
    try:
        session.execute(
            text(
                """DELETE FROM document.map_document_user_session
                WHERE document_id = :document_id AND user_id = :user_id"""
            )
            .bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="user_id", type_=String),
            )
            .params(document_id=document_id, user_id=data.user_id)
        )

        session.commit()
        return {"status": DocumentEditStatus.unlocked}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/document/{document_id}/status")
async def get_document_status(
    document_id: str, data: UserID = Body(...), session: Session = Depends(get_session)
):
    stmt = (
        text(
            "SELECT * from document.map_document_user_session WHERE document_id = :document_id"
        )
        .bindparams(bindparam(key="document_id", type_=UUIDType))
        .params(document_id=document_id)
    )
    result = session.execute(stmt).fetchone()
    if result:
        # if user id matches, return the document checked out, otherwise return locked
        if result.user_id == data.user_id:
            # there's already a record so no need to create
            return {"status": DocumentEditStatus.checked_out}

        # the map is already checked out; should return as locked
        return {"status": DocumentEditStatus.locked}
    else:
        # the map is able to be checked out;
        # should return as unlocked, but should now
        # create a record in the map_document_user_session table
        session.execute(
            text(
                f"""INSERT INTO document.map_document_user_session (document_id, user_id)
                VALUES ('{document_id}', '{data.user_id}')"""
            )
        )
        session.commit()

        return {"status": DocumentEditStatus.checked_out}


@app.get("/api/document/{document_id}/unassigned", response_model=BBoxGeoJSONs)
async def get_unassigned_geoids(
    document: Annotated[Document, Depends(_get_document)],
    exclude_ids: list[str] = Query(default=[]),
    session: Session = Depends(get_session),
):
    stmt = text(
        "SELECT * from get_unassigned_bboxes(:doc_uuid, :exclude_ids)"
    ).bindparams(
        bindparam(key="doc_uuid", type_=UUIDType),
        bindparam(key="exclude_ids", type_=ARRAY(String)),
    )
    try:
        results = session.execute(
            stmt, {"doc_uuid": document.document_id, "exclude_ids": exclude_ids}
        ).fetchall()
        print(results)
    except DataError:
        # could not return null - no results found
        results = []

    print(results)
    # returns a list of multipolygons of bboxes
    return {"features": [row[0] for row in results if row[0] is not None]}


def _get_districtr_map(
    document_id: str,
    session: Session = Depends(get_session),
) -> DistrictrMap:
    stmt = (
        select(DistrictrMap)
        .join(
            Document,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,  # pyright: ignore
            isouter=True,
        )
        .where(Document.document_id == document_id)
    )

    try:
        districtr_map = session.exec(
            stmt,
        ).one()
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID {document_id} not found",
        )
    except MultipleResultsFound:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Multiple DistrictrMaps found for Document with ID {document_id}",
        )

    return districtr_map


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
    document_id: str,
    districtr_map: Annotated[DistrictrMap, Depends(_get_districtr_map)],
    zone: list[int] = Query(default=[]),
    session: Session = Depends(get_session),
):
    if districtr_map.child_layer is not None:
        logger.info(
            f"Using child layer {districtr_map.child_layer} for document {document_id}"
        )
        gerrydb_name = districtr_map.child_layer
        kwargs = {"zones": zone} if len(zone) > 0 else {}
        zone_assignments = contiguity.get_block_assignments(
            session, document_id, **kwargs
        )
    else:
        gerrydb_name = districtr_map.parent_layer
        logger.info(
            f"No child layer configured for document. Defauling to parent layer {gerrydb_name} for document {document_id}"
        )
        sql = text(
            """
            SELECT
                zone,
                array_agg(geo_id) as nodes
            FROM
                document.assignments
            WHERE
                document_id = :document_id
                AND zone IS NOT NULL
            GROUP BY
                zone"""
        )
        result = session.execute(sql, {"document_id": document_id}).fetchall()
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
    document_id: str,
    districtr_map: Annotated[DistrictrMap, Depends(_get_districtr_map)],
    zone: int,
    session: Session = Depends(get_session),
):
    if districtr_map.child_layer is not None:
        logger.info(
            f"Using child layer {districtr_map.child_layer} for document {document_id}"
        )
        gerrydb_name = districtr_map.child_layer
        zone_assignments = contiguity.get_block_assignments_bboxes(
            session, document_id, zones=[zone]
        )
        if len(zone_assignments) == 0:
            raise HTTPException(status_code=404, detail="Zone not found")
        elif len(zone_assignments) > 1:
            raise HTTPException(status_code=500, detail="Multiple zones found")
        zone_assignments = zone_assignments[0]
    else:
        gerrydb_name = districtr_map.parent_layer
        logger.info(
            f"No child layer configured for document. Defauling to parent layer {gerrydb_name} for document {document_id}"
        )
        sql = text(
            f"""
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
                AND zone = :zone"""
        )

        results = session.execute(sql, {"document_id": document_id, "zone": zone}).all()

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

    from_srid = session.execute(
        text(
            """SELECT srid
                FROM geometry_columns
                WHERE f_table_name = :table_name
                    AND f_table_schema = 'gerrydb'
                LIMIT 1"""
        ),
        {"table_name": gerrydb_name},
    ).scalar()

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

        print(minx, miny, maxx, maxy)

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
    document: Annotated[Document, Depends(_get_document)],
    metadata: dict = Body(...),
    session: Session = Depends(get_session),
):
    try:
        # update document record with metadata
        stmt = (
            update(Document)
            .where(Document.document_id == document.document_id)
            .values(map_metadata=metadata)
        )
        session.execute(stmt)
        session.commit()

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        )


@app.get("/api/gerrydb/views", response_model=list[DistrictrMapPublic])
async def get_projects(
    *,
    session: Session = Depends(get_session),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
):
    gerrydb_views = session.exec(
        select(DistrictrMap)
        .filter(DistrictrMap.visible == true())  # pyright: ignore
        .order_by(DistrictrMap.created_at.asc())  # pyright: ignore
        .offset(offset)
        .limit(limit)
    ).all()
    return gerrydb_views


@app.get("/api/document/{document_id}/thumbnail", status_code=status.HTTP_200_OK)
async def get_thumbnail(*, document_id: str, session: Session = Depends(get_session)):
    try:
        if thumbnail_exists(document_id):
            return RedirectResponse(
                url=f"{settings.CDN_URL}/thumbnails/{document_id}.png"
            )
        else:
            return RedirectResponse(url="/home-megaphone.png")
    except:
        return RedirectResponse(url="/home-megaphone.png")


@app.post("/api/document/{document_id}/thumbnail", status_code=status.HTTP_200_OK)
async def make_thumbnail(
    *,
    document_id: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
):
    try:
        stmt = select(Document.document_id).filter(Document.document_id == document_id)
        map = session.execute(stmt).first()
    except DataError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document ID did not fit UUID format",
        )
    if map == None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    background_tasks.add_task(
        generate_thumbnail, session=session, document_id=document_id
    )
    return {"message": "Generating thumbnail in background task"}


@app.post("/api/document/{document_id}/share")
async def share_districtr_plan(
    document: Annotated[Document, Depends(_get_document)],
    params: dict = Body(...),
    session: Session = Depends(get_session),
):
    # check if there's already a record for a document
    existing_token = session.execute(
        text(
            """
            SELECT token_id, password_hash FROM document.map_document_token
            WHERE document_id = :doc_id
            """
        ),
        {"doc_id": document.document_id},
    ).fetchone()

    if existing_token:
        token_uuid = existing_token.token_id

        if params["password"] is not None and not existing_token.password_hash:
            hashed_password = hash_password(params["password"])
            session.execute(
                text(
                    """
                    UPDATE document.map_document_token
                    SET password_hash = :password_hash
                    WHERE token_id = :token_id
                    """
                ),
                {"password_hash": hashed_password, "token_id": token_uuid},
            )
            session.commit()

        elif params["password"] is None:
            payload = {
                "token": token_uuid,
                "access": (
                    params["access_type"]
                    if params["access_type"]
                    else DocumentShareStatus.read
                ),
            }

        payload = {
            "token": token_uuid,
            "access": (
                params["access_type"]
                if "access_type" in params
                else DocumentShareStatus.read
            ),
            "password_required": bool(existing_token.password_hash),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        return {"token": token}

    else:
        token_uuid = str(uuid4())
        hashed_password = (
            hash_password(params["password"]) if params["password"] else None
        )
        expiry = (
            datetime.now(UTC) + timedelta(days=params["expiry_days"])
            if "expiry_days" in params
            else None
        )

        session.execute(
            text(
                """
                INSERT INTO document.map_document_token (token_id, document_id, password_hash, expiration_date)
                VALUES (:token_id, :document_id, :password_hash, :expiration_date)
                """
            ),
            {
                "token_id": token_uuid,
                "document_id": document.document_id,
                "password_hash": hashed_password,
                "expiration_date": expiry,
            },
        )

        session.commit()

    payload = {
        "token": token_uuid,
        "access": (
            params["access_type"] if params["access_type"] else DocumentShareStatus.read
        ),
        "password_required": bool(hashed_password),
    }

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return {"token": token}


@app.post("/api/share/load_plan_from_share", response_model=DocumentPublic)
async def load_plan_from_share(
    data: TokenRequest,
    session: Session = Depends(get_session),
):
    token_id = data.token
    result = session.execute(
        text(
            """
            SELECT document_id, password_hash, expiration_date
            FROM document.map_document_token
            WHERE token_id = :token
            """
        ),
        {"token": token_id},
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )

    set_is_locked = False
    if result.password_hash:
        # password is required
        if data.password is None:
            set_is_locked = True
        if data.password and not verify_password(data.password, result.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password",
            )

    # return the document to the user with the password
    return await get_document(
        str(result.document_id),
        data.user_id,
        session,
        shared=True,
        access_type=data.access,
        lock_status=(
            DocumentEditStatus.locked if set_is_locked else DocumentEditStatus.unlocked
        ),
    )


@app.post("/api/document/{document_id}/checkout", status_code=status.HTTP_200_OK)
async def checkout_plan(
    document: Annotated[Document, Depends(_get_document)],
    params: dict = Body(...),
    session: Session = Depends(get_session),
):
    """
    check user-provided password against database. if matches, check if map is checked out
    - if pw matches and not checked out, check map out to user
    - if pw matches and checked out, return warning that map is still locked but switch access to edit
    """

    token_id = params["token"]
    result = session.execute(
        text(
            """
            SELECT document_id, password_hash, expiration_date
            FROM document.map_document_token
            WHERE token_id = :token
            """
        ),
        {"token": token_id},
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )
    if params["password"] and not verify_password(
        params["password"], result.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )

    if verify_password(params["password"], result.password_hash):
        # check lock status
        lock_status = check_map_lock(document.document_id, params["user_id"], session)

        return {"status": lock_status, "access": DocumentShareStatus.edit}


@app.get("/api/document/{document_id}/export", status_code=status.HTTP_200_OK)
async def get_survey_results(
    *,
    document: Annotated[Document, Depends(_get_document)],
    background_tasks: BackgroundTasks,
    format: str = "CSV",
    export_type: str = "ZoneAssignments",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10_000, ge=0),
    session: Session = Depends(get_session),
) -> FileResponse:
    try:
        _format = DocumentExportFormat(format)
        _export_type = DocumentExportType(export_type)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    out_file_name = f"{document.document_id}_{_export_type.value}_{timestamp}.{_format.value.lower()}"

    try:
        get_sql = get_export_sql_method(_format)
        sql, params = get_sql(
            _export_type,
            document_id=document.document_id,
            offset=offset,
            limit=limit,
        )
    except NotImplementedError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )

    conn = session.connection().connection
    _out_file = f"/tmp/{out_file_name}"
    background_tasks.add_task(remove_file, _out_file)

    with conn.cursor().copy(sql, params=params) as copy:
        with open(_out_file, "wb") as f:
            while data := copy.read():
                f.write(data)
            f.close()

        media_type = {
            DocumentExportFormat.csv: "text/csv; charset=utf-8",
            DocumentExportFormat.geojson: "application/json",
        }.get(_format, "text/plain; charset=utf-8")
        return FileResponse(
            path=_out_file, media_type=media_type, filename=out_file_name
        )
