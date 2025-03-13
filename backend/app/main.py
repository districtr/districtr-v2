from fastapi import FastAPI, status, Depends, HTTPException, Query, BackgroundTasks
import botocore.exceptions
from sqlalchemy.exc import MultipleResultsFound, NoResultFound, DataError
from fastapi.responses import FileResponse
from sqlalchemy import text, update
from sqlalchemy.exc import ProgrammingError, InternalError
from sqlmodel import Session, String, select, true
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert
import logging
from sqlalchemy import bindparam
from sqlmodel import ARRAY, INT
from datetime import datetime, UTC
import sentry_sdk
from app.core.db import engine
from app.core.config import settings
import app.contiguity.main as contiguity
from networkx import Graph
from app.models import (
    Assignments,
    AssignmentsCreate,
    AssignmentsResponse,
    ColorsSetResult,
    DistrictrMap,
    Document,
    DocumentCreate,
    DocumentPublic,
    GEOIDS,
    GEOIDSResponse,
    AssignedGEOIDS,
    UUIDType,
    ZonePopulation,
    DistrictrMapPublic,
    ParentChildEdges,
    ShatterResult,
    UnassignedBboxGeoJSONs,
    SummaryStatisticColumnLists,
)
from sqlalchemy.sql import func
from app.utils import remove_file
from app.exports import (
    get_export_sql_method,
    DocumentExportType,
    DocumentExportFormat,
)
from aiocache import Cache


if settings.ENVIRONMENT in ("production", "qa"):
    sentry_sdk.init(
        dsn="https://b14aae02017e3a9c425de4b22af7dd0c@o4507623009091584.ingest.us.sentry.io/4507623009746944",
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
        environment=settings.ENVIRONMENT.value,
    )

app = FastAPI()

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


def get_session():
    with Session(engine) as session:
        yield session


def update_timestamp(
    session: Session,
    document_id: str,
) -> datetime:
    update_stmt = (
        update(Document)
        .where(Document.document_id == document_id)
        .values(updated_at=func.now())
        .returning(Document.updated_at)
    )
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


# matches createMapObject in apiHandlers.ts
@app.post(
    "/api/create_document",
    response_model=DocumentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_document(
    data: DocumentCreate, session: Session = Depends(get_session)
):
    results = session.execute(
        text("SELECT create_document(:gerrydb_table_name);"),
        {"gerrydb_table_name": data.gerrydb_table},
    )
    document_id = results.one()[0]  # should be only one row, one column of results

    stmt = (
        select(
            Document.document_id,
            Document.created_at,
            Document.gerrydb_table,
            Document.updated_at,
            DistrictrMap.uuid.label("map_uuid"),  # pyright: ignore
            DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
            DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
            DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
            DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
            DistrictrMap.extent.label("extent"),  # pyright: ignore
            DistrictrMap.available_summary_stats.label("available_summary_stats"),  # pyright: ignore
        )
        .where(Document.document_id == document_id)
        .join(
            DistrictrMap,
            Document.gerrydb_table == DistrictrMap.gerrydb_table_name,
            isouter=True,
        )
    )
    # Document id has a unique constraint so I'm not sure we need to hit the DB again here
    # more valuable would be to check that the assignments table
    doc = session.exec(
        stmt,
    ).one()
    if not doc.map_uuid:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"DistrictrMap matching {data.gerrydb_table} does not exist.",
        )
    if not doc.document_id:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document creation failed",
        )
    if not doc.parent_layer:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document creation failed",
        )

    session.commit()

    return doc


@app.patch("/api/update_assignments")
async def update_assignments(
    data: AssignmentsCreate, session: Session = Depends(get_session)
):
    assignments = data.model_dump()["assignments"]
    stmt = insert(Assignments).values(assignments)
    stmt = stmt.on_conflict_do_update(
        constraint=Assignments.__table__.primary_key, set_={"zone": stmt.excluded.zone}
    )
    session.execute(stmt)
    updated_at = None
    if len(data.assignments) > 0:
        updated_at = update_timestamp(session, assignments[0]["document_id"])
    session.commit()
    return {"assignments_upserted": len(data.assignments), "updated_at": updated_at}


@app.patch(
    "/api/update_assignments/{document_id}/shatter_parents",
    response_model=ShatterResult,
)
async def shatter_parent(
    document_id: str, data: GEOIDS, session: Session = Depends(get_session)
):
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
            "input_document_id": document_id,
            "parent_geoids": data.geoids,
        },
    )
    # :( was getting validation errors so am just going to loop
    assignments = [
        Assignments(document_id=str(document_id), geo_id=geo_id, zone=zone)
        for document_id, geo_id, zone in results
    ]
    updated_at = update_timestamp(session, document_id)
    result = ShatterResult(parents=data, children=assignments, updated_at=updated_at)
    session.commit()
    return result


@app.patch(
    "/api/update_assignments/{document_id}/unshatter_parents",
    response_model=GEOIDSResponse,
)
async def unshatter_parent(
    document_id: str, data: AssignedGEOIDS, session: Session = Depends(get_session)
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
            "input_document_id": document_id,
            "parent_geoids": data.geoids,
            "input_zone": data.zone,
        },
    ).first()

    updated_at = update_timestamp(session, document_id)
    session.commit()
    return {"geoids": results[0], "updated_at": updated_at}


@app.patch(
    "/api/update_assignments/{document_id}/reset", status_code=status.HTTP_200_OK
)
async def reset_map(document_id: str, session: Session = Depends(get_session)):
    # Drop the partition for the given assignments
    partition_name = f'"document.assignments_{document_id}"'
    session.execute(text(f"DROP TABLE IF EXISTS {partition_name} CASCADE;"))

    # Recreate the partition
    session.execute(
        text(
            f"""
        CREATE TABLE {partition_name} PARTITION OF document.assignments
        FOR VALUES IN ('{document_id}');
    """
        )
    )

    session.execute(
        text(
            f"UPDATE document.document SET color_scheme = NULL WHERE document_id = '{document_id}'"
        )
    )

    session.commit()

    return {"message": "Assignments partition reset", "document_id": document_id}


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
            Document.gerrydb_table == DistrictrMap.gerrydb_table_name,  # pyright: ignore
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
async def get_assignments(document_id: str, session: Session = Depends(get_session)):
    stmt = (
        select(
            Assignments.geo_id,
            Assignments.zone,
            Assignments.document_id,
            ParentChildEdges.parent_path,
        )
        .join(Document, Assignments.document_id == Document.document_id)
        .join(DistrictrMap, Document.gerrydb_table == DistrictrMap.gerrydb_table_name)
        .outerjoin(
            ParentChildEdges,
            (Assignments.geo_id == ParentChildEdges.child_path)
            & (ParentChildEdges.districtr_map == DistrictrMap.uuid),
        )
        .where(Assignments.document_id == document_id)
    )

    return session.execute(stmt).fetchall()


@app.get("/api/document/{document_id}", response_model=DocumentPublic)
async def get_document(document_id: str, session: Session = Depends(get_session)):
    stmt = (
        select(
            Document.document_id,
            Document.created_at,
            Document.gerrydb_table,
            Document.updated_at,
            Document.color_scheme,
            DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
            DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
            DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
            DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
            DistrictrMap.extent.label("extent"),  # pyright: ignore
            DistrictrMap.available_summary_stats.label("available_summary_stats"),  # pyright: ignore
        )  # pyright: ignore
        .where(Document.document_id == document_id)
        .join(
            DistrictrMap,
            Document.gerrydb_table == DistrictrMap.gerrydb_table_name,
            isouter=True,
        )
        .limit(1)
    )
    result = session.exec(stmt)

    return result.one()


@app.get("/api/document/{document_id}/total_pop", response_model=list[ZonePopulation])
async def get_total_population(
    document_id: str, session: Session = Depends(get_session)
):
    stmt = text(
        "SELECT * from get_total_population(:document_id) WHERE zone IS NOT NULL"
    )
    try:
        result = session.execute(stmt, {"document_id": document_id})
        return [
            ZonePopulation(zone=zone, total_pop=pop) for zone, pop in result.fetchall()
        ]
    except (ProgrammingError, InternalError) as e:
        logger.error(e)
        error_text = str(e)
        if f"Table name not found for document_id: {document_id}" in error_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID {document_id} not found",
            )
        elif "Population column not found for gerrydbview" in error_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Population column not found in GerryDB view",
            )


@app.get(
    "/api/document/{document_id}/unassigned", response_model=UnassignedBboxGeoJSONs
)
async def get_unassigned_geoids(
    document_id: str,
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
            stmt, {"doc_uuid": document_id, "exclude_ids": exclude_ids}
        ).fetchall()
        print(results)
    except DataError:
        # could not return null - no results found
        results = []

    print(results)
    # returns a list of multipolygons of bboxes
    return {"features": [row[0] for row in results if row[0] is not None]}


@app.get("/api/document/{document_id}/contiguity")
async def check_document_contiguity(
    document_id: str,
    # TODO: Allow passing zones to check contiguity for specific zones
    # Should be slightly more efficient that checking all zones
    # zone: list[str] = Query(default=[]),
    session: Session = Depends(get_session),
):
    # sql/get_block_assignments.sql also fetches the child layer. Would be nice not
    # to have to do this twice. TODO: when supporting multiple zones, in new
    # function also return the child layer name
    stmt = (
        select(DistrictrMap)
        .join(
            Document,
            Document.gerrydb_table == DistrictrMap.gerrydb_table_name,  # pyright: ignore
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

    if districtr_map.child_layer is not None:
        logger.info(
            f"Using child layer {districtr_map.child_layer} for document {document_id}"
        )
        gerrydb_name = districtr_map.child_layer
        zone_assignments = contiguity.get_block_assignments(
            session, document_id, districtr_map.uuid
        )
    else:
        gerrydb_name = districtr_map.parent_layer
        logger.info(
            f"No child layer configured for document. Defauling to parent layer {gerrydb_name} for document {document_id}"
        )
        sql = text("""
            select zone, array_agg(geo_id) as nodes
            from assignments
            where document_id = :document_id group by zone
            and zone is not null""")
        result = session.execute(sql, {"document_id": document_id}).fetchall()
        zone_assignments = [
            contiguity.ZoneBlockNodes(zone=row.zone, nodes=row.nodes) for row in result
        ]

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

    results = {}
    for zone_blocks in zone_assignments:
        logger.info(f"Checking contiguity for zone {zone_blocks.zone}")
        results[zone_blocks.zone] = contiguity.subgraph_number_connected_components(
            G=G, subgraph_nodes=zone_blocks.nodes
        )

    return results


@app.get("/api/document/{document_id}/demography")
async def get_map_demography(
    document_id: str,
    ids: list[str] = Query(default=[]),
    stats: list[str] = Query(default=[]),
    session: Session = Depends(get_session),
):
    document = session.exec(
        select(Document).filter(Document.document_id == document_id)
    ).one()

    dm = session.exec(
        select(DistrictrMap).filter(
            DistrictrMap.gerrydb_table_name == document.gerrydb_table
        )
    ).one()

    columns = []
    if dm.available_summary_stats is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str("Summary statistic not available for this map"),
        )
    # by default use all available columns otherwise the requested columns
    available_summary_stats = dm.available_summary_stats if len(stats) == 0 else stats
    # By default, provide all summary stats
    for summary_stat in available_summary_stats:
        if summary_stat not in SummaryStatisticColumnLists.__members__:
            continue
        else:
            stat_cols = SummaryStatisticColumnLists[summary_stat]
            columns.extend(stat_cols.value)

    if len(ids) > 0:
        # If the user sends a selection of IDs, just use those
        # This bypasses the document.assignments and gerrydb.parent full query
        # Essentially we use the user provided IDs as start of the join
        # This could be a where clause at the end, but this should be faster
        ids_subquery = text(
            """
            SELECT DISTINCT * FROM (VALUES {}) as inner_ids (geo_id)
        """.format(",".join(f"(:id{i})" for i in range(len(ids))))
        )
        # This is for efficiency but slightly slippery
        # Adding the format here provides some safety
        params = {f"id{i}": id for i, id in enumerate(ids)}
    else:
        # direct string interpolation of dm.parent_layer is safe
        # since it always comes from the database
        # This gives us all VTDs
        # and any shattered children
        # The FE will filter for shattered parents
        ids_subquery = text(f"""SELECT distinct geo_id
            FROM document.assignments
            WHERE document_id = :document_id
            UNION
            SELECT path as geo_id
            FROM gerrydb.{dm.parent_layer}""")
        params = {"document_id": document_id}

    stmt = text(f"""
        SELECT path, {",".join(columns)}
        FROM ({ids_subquery}) as ids
        LEFT JOIN gerrydb.{dm.gerrydb_table_name} gdb
        on gdb.path = ids.geo_id
        WHERE path is not null
    """)

    results = session.execute(stmt, params).fetchall()
    return {
        "columns": ["path", *columns],
        "results": [[*row] for row in results],
    }


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


@app.get("/api/document/{document_id}/export", status_code=status.HTTP_200_OK)
async def get_survey_results(
    *,
    document_id: str,
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
    out_file_name = (
        f"{document_id}_{_export_type.value}_{timestamp}.{_format.value.lower()}"
    )

    try:
        get_sql = get_export_sql_method(_format)
        sql, params = get_sql(
            _export_type,
            document_id=document_id,
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
