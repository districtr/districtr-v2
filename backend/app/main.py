from fastapi import (
    FastAPI,
    status,
    Depends,
    HTTPException,
    Query,
    Form,
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
from sqlmodel import Session, String, select, true, update
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert, TEXT, JSONB
import logging
from sqlalchemy import bindparam, cast
from sqlmodel import ARRAY, INT
from datetime import datetime
import sentry_sdk
from fastapi_utils.tasks import repeat_every
from app.assignments import duplicate_document_assignments, batch_insert_assignments
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
import app.contiguity.main as contiguity
import app.save_share.main as save_share
import app.thumbnails.main as thumbnails
from networkx import Graph, connected_components
from app.models import (
    Assignments,
    AssignmentsResponse,
    ColorsSetResult,
    DistrictrMap,
    DistrictrMapsToGroups,
    Document,
    DocumentCreate,
    DocumentCreatePublic,
    DocumentPublic,
    DocumentEditStatus,
    DocumentMetadata,
    GEOIDS,
    GEOIDSResponse,
    AssignedGEOIDS,
    UUIDType,
    ParentChildEdges,
    ShatterResult,
    BBoxGeoJSONs,
    MapGroup,
    AssignmentsCreate,
)
from pydantic_geojson import PolygonModel
from pydantic_geojson._base import Coordinates
from sqlalchemy.sql import func
from sqlalchemy.sql.functions import coalesce
from app.save_share.locks import (
    cleanup_expired_locks as _cleanup_expired_locks,
    remove_all_locks,
    check_map_lock,
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
    remove_all_locks(session=session)


app = FastAPI(lifespan=lifespan)
app.include_router(exports.router)
app.include_router(cms.router)
app.include_router(comments.router)
app.include_router(save_share.router)
app.include_router(thumbnails.router)

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


@app.post("/api/document/{document_id}/unload", status_code=status.HTTP_200_OK)
async def unlock_map(
    document_id: DocumentID = Depends(parse_document_id),
    user_id: str = Form(...),
    session: Session = Depends(get_session),
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
            {"document_id": document_id.value, "user_id": user_id},
        )
        session.commit()
        return {"status": DocumentEditStatus.unlocked}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# matches createMapObject in apiHandlers.ts
@app.post(
    "/api/create_document",
    response_model=DocumentCreatePublic,
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

    # Checking a document's lock status will create one if none is found, as in
    # the case of new documents
    lock_status = check_map_lock(document_id, data.user_id, session)

    total_assignments = 0

    if data.copy_from_doc is not None:
        copy_document_id = parse_document_id(data.copy_from_doc)
        if not copy_document_id:
            raise HTTPException(status_code=404, detail="Document not found")
        data.copy_from_doc = copy_document_id
        copied_document = get_protected_document(
            document_id=data.copy_from_doc, session=session
        )
        assert copied_document.document_id is not None
        total_assignments = duplicate_document_assignments(
            from_document_id=copied_document.document_id,
            to_document_id=document_id,
            session=session,
        )
        plan_genesis = "copied"

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
        logger.info(
            f"Updating metadata for document: {document_id if not data.copy_from_doc else copied_document.document_id}"
        )
        await update_districtrmap_metadata(
            document=copied_document, metadata=data.metadata, session=session
        )

    stmt = (
        select(
            Document.document_id,
            Document.public_id,
            Document.created_at,
            Document.districtr_map_slug,
            DistrictrMap.gerrydb_table_name.label("gerrydb_table"),  # pyright: ignore
            Document.updated_at,
            DistrictrMap.uuid.label("map_uuid"),  # pyright: ignore
            DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
            DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
            DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
            DistrictrMap.name.label("map_module"),  # pyright: ignore
            DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
            DistrictrMap.extent.label("extent"),  # pyright: ignore
            DistrictrMap.map_type.label("map_type"),  # pyright: ignore
            coalesce(plan_genesis).label("genesis"),
            coalesce(total_assignments).label("inserted_assignments"),
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

    doc = session.exec(
        stmt,
    ).one()

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
    data: AssignmentsCreate, session: Session = Depends(get_session)
):
    document_id = data.assignments[0].document_id
    assignments = assignments = data.model_dump()["assignments"]
    lock_status = check_map_lock(document_id, data.user_id, session)

    if lock_status == DocumentEditStatus.checked_out:
        stmt = insert(Assignments).values(assignments)
        stmt = stmt.on_conflict_do_update(
            constraint=Assignments.__table__.primary_key,
            set_={"zone": stmt.excluded.zone},
        )
        session.execute(stmt)
        updated_at = None
        if len(data.assignments) > 0:
            updated_at = update_timestamp(session, document_id)
            logger.info(f"Document updated at {updated_at}")
        session.commit()
        return {"assignments_upserted": len(data.assignments), "updated_at": updated_at}
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is locked by another user",
        )


@app.patch(
    "/api/update_assignments/{document_id}/shatter_parents",
    response_model=ShatterResult,
)
async def shatter_parent(
    document: Annotated[Document, Depends(get_document)],
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
    document: Annotated[Document, Depends(get_document)],
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
    document: Annotated[Document, Depends(get_document)],
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
    colors: list[str],
    document_id: DocumentID = Depends(parse_document_id),
    session: Session = Depends(get_session),
):
    districtr_map = session.exec(
        select(DistrictrMap)
        .join(
            Document,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,  # pyright: ignore
            isouter=True,
        )
        .where(Document.document_id == document_id.value)
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
    session.execute(stmt, {"document_id": document_id.value, "colors": colors})
    session.commit()
    return ColorsSetResult(colors=colors)


# called by getAssignments in apiHandlers.ts
@app.get("/api/get_assignments/{document_id}", response_model=list[AssignmentsResponse])
async def get_assignments(
    document: Annotated[Document, Depends(get_protected_document)],
    session: Session = Depends(get_session),
):
    stmt = (
        select(
            Assignments.geo_id,
            Assignments.zone,
            ParentChildEdges.parent_path,
        )
        .join(Document, onclause=Assignments.document_id == Document.document_id)
        .join(
            DistrictrMap,
            onclause=Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
        )
        .outerjoin(
            ParentChildEdges,
            onclause=(Assignments.geo_id == ParentChildEdges.child_path)
            & (ParentChildEdges.districtr_map == DistrictrMap.uuid),
        )
        .where(Assignments.document_id == document.document_id)
    )
    return session.execute(stmt).fetchall()


@app.get("/api/document/{document_id}", response_model=DocumentPublic)
async def get_document_object(
    document_id: DocumentID = Depends(parse_document_id),
    user_id: str | None = None,
    session: Session = Depends(get_session),
):
    try:
        return get_document_public(
            document_id=document_id, user_id=user_id, session=session
        )
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
        select(
            Document.public_id,
            Document.map_metadata,
            Document.updated_at,
            DistrictrMap.name.label("map_module"),
        )
        .join(
            DistrictrMap,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
            isouter=True,
        )
        .offset(offset)
        .limit(limit)
    )

    if len(tags) > 0:
        stmt = stmt.where(
            cast(Document.map_metadata["tags"], JSONB).op("?|")(
                bindparam("tags", value=list(tags), type_=ARRAY(TEXT))
            )
        ).where(
            # this is fine to keep as ->> because you're comparing to text
            Document.map_metadata["draft_status"].astext == "ready_to_share"
        )
    elif len(ids) > 0:
        stmt = stmt.where(Document.public_id.in_(ids))
    results = session.execute(stmt).fetchall()
    return [
        {
            "public_id": row[0],
            "map_metadata": row[1],
            "updated_at": row[2],
            "map_module": row[3],
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
        results = session.execute(
            stmt, {"doc_uuid": document.document_id, "exclude_ids": exclude_ids}
        ).fetchall()
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
    districtr_map = get_districtr_map(document_id=document.document_id, session=session)

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
        result = session.execute(sql, {"document_id": document.document_id}).fetchall()
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
    districtr_map = get_districtr_map(document_id=document.document_id, session=session)
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

        results = session.execute(
            sql, {"document_id": document.document_id, "zone": zone}
        ).all()

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
        session.execute(stmt)
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
            DistrictrMapsToGroups.districtrmap_uuid == DistrictrMap.uuid,
        )
        .filter(DistrictrMapsToGroups.group_slug == group)
        .filter(DistrictrMap.visible == true())  # pyright: ignore
        .order_by(DistrictrMap.name.asc())  # pyright: ignore
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
    group = session.execute(
        statement=stmt,
    ).first()

    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Group matching {group_slug} does not exist.",
        )
    return {
        "name": group[0].name,
        "slug": group[0].slug,
    }
