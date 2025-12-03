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
from sqlmodel import Session, String, select, true, update, col
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert
import logging
from sqlalchemy import bindparam
from sqlmodel import ARRAY
from datetime import datetime
import sentry_sdk
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
    DocumentMetadata,
    GEOIDS,
    UUIDType,
    ParentChildEdges,
    ShatterResult,
    BBoxGeoJSONs,
    MapGroup,
    AssignmentsCreate,
)
from app.comments.models import DocumentComment, Tag, CommentTag
from pydantic_geojson import PolygonModel
from pydantic_geojson._base import Coordinates
from sqlalchemy.sql import func
from sqlalchemy.sql.functions import coalesce
from app.utils import update_or_select_district_stats
from aiocache import Cache
from contextlib import asynccontextmanager
from fiona.transform import transform
from fastapi import BackgroundTasks

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
    results = session.execute(
        text("SELECT create_document(:districtr_map_slug);"),
        {"districtr_map_slug": data.districtr_map_slug},
    )
    document_id = results.one()[0]  # create_document only returns the ID
    created_document = get_document(
        document_id=DocumentID(document_id=str(document_id)), session=session
    )

    total_assignments = 0

    if data.copy_from_doc is not None:
        logger.info(
            f"Copying document. Origin document: {data.copy_from_doc} to {document_id}"
        )
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
            document=created_document, metadata=data.metadata, session=session
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
            coalesce(total_assignments).label("inserted_assignments"),
            Document.map_metadata,
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


@app.put("/api/assignments")
async def update_assignments(
    data: AssignmentsCreate, session: Session = Depends(get_session)
):
    if not data.assignments or not len(data.assignments) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No assignments provided",
        )

    document_id = data.assignments[0].document_id
    assignments = data.model_dump()["assignments"]
    last_updated_at = data.model_dump()["last_updated_at"]

    db_last_updated_at = session.exec(
        select(Document.updated_at).where(Document.document_id == document_id)
    ).one_or_none()

    if db_last_updated_at > last_updated_at and not data.overwrite:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document has been updated since the last update",
        )
    # Use a single TRUNCATE statement if Assignments is partitioned per-document, otherwise use bulk delete as before
    session.execute(
        text("DELETE FROM document.assignments WHERE document_id = :document_id"),
        {"document_id": document_id}
    )

    # Use executemany for bulk insert if possible (sqlalchemy handles this with session.execute(insert(...).values(...)))
    stmt = insert(Assignments)
    session.execute(stmt, assignments)

    updated_at = None
    if len(data.assignments) > 0:
        updated_at = update_timestamp(session, document_id)
        logger.info(f"Document updated at {updated_at}")

    session.commit()
    return {"assignments_inserted": len(data.assignments), "updated_at": updated_at}


@app.post(
    "/api/edges/{document_id}",
    response_model=list[ShatterResult],
)
async def get_children(
    document: Annotated[Document, Depends(get_document)],
    data: GEOIDS,
    session: Session = Depends(get_session),
):
    assert document.document_id is not None
    districtr_map_slug = session.exec(
        select(Document.districtr_map_slug).where(
            Document.document_id == document.document_id
        )
    ).one()
    db_districtr_map_uuid = session.exec(
        select(DistrictrMap.uuid).where(
            DistrictrMap.districtr_map_slug == districtr_map_slug
        )
    ).one()
    stmt = text(
        """SELECT child_path, parent_path
        FROM parentchildedges pce
        WHERE pce.parent_path = ANY(:parent_geoids)
        AND pce.districtr_map = :districtr_map_uuid"""
    ).bindparams(
        bindparam(key="districtr_map_uuid", type_=UUIDType),
        bindparam(key="parent_geoids", type_=ARRAY(String)),
    )
    results = session.execute(
        statement=stmt,
        params={
            "districtr_map_uuid": db_districtr_map_uuid,
            "parent_geoids": data.geoids,
        },
    ).fetchall()
    return results


@app.patch("/api/assignments/{document_id}/reset", status_code=status.HTTP_200_OK)
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
    districtr_map_uuid = session.exec(
        select(DistrictrMap.uuid)
        .join(
            Document,
            onclause=col(Document.districtr_map_slug)
            == DistrictrMap.districtr_map_slug,
        )
        .where(Document.document_id == document.document_id)
    ).one()

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
    return session.exec(stmt).fetchall()


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
        select(
            Document.public_id,
            Document.map_metadata,
            Document.updated_at,
            DistrictrMap.name.label("map_module"),
        )
        .distinct(
            Document.public_id,
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
        stmt = (
            stmt.join(
                DocumentComment,
                DocumentComment.document_id == Document.document_id,
            )
            .join(
                CommentTag,
                CommentTag.comment_id == DocumentComment.comment_id,
            )
            .join(
                Tag,
                Tag.id == CommentTag.tag_id,
            )
            .where(
                Tag.slug.in_(tags),
            )
            .where(
                # this is fine to keep as ->> because you're comparing to text
                Document.map_metadata["draft_status"].astext == "ready_to_share"
            )
        )

    if len(ids) > 0:
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
