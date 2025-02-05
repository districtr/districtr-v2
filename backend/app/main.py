from fastapi import FastAPI, status, Depends, HTTPException, Query, BackgroundTasks
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
from app.models import (
    Assignments,
    AssignmentsCreate,
    AssignmentsResponse,
    DistrictrMap,
    Document,
    DocumentCreate,
    DocumentPublic,
    GEOIDS,
    AssignedGEOIDS,
    UUIDType,
    ZonePopulation,
    DistrictrMapPublic,
    ParentChildEdges,
    ShatterResult,
    SummaryStatisticType,
    SummaryStatsP1,
    PopulationStatsP1,
    SummaryStatsP4,
    PopulationStatsP4,
    UnassignedBboxGeoJSONs,
)
from app.utils import remove_file
from app.exports import (
    get_export_sql_method,
    DocumentExportType,
    DocumentExportFormat,
)

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
    updated_at: str,
):
    update_stmt = (
        update(Document)
        .where(Document.document_id == document_id)
        .values(updated_at=updated_at)
    )
    session.execute(update_stmt)


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
    if len(data.assignments) > 0:
        update_timestamp(session, assignments[0]["document_id"], data.updated_at)
    session.commit()
    return {"assignments_upserted": len(data.assignments)}


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
    result = ShatterResult(parents=data, children=assignments)
    update_timestamp(session, document_id, data.updated_at)
    session.commit()
    return result


@app.patch(
    "/api/update_assignments/{document_id}/unshatter_parents",
    response_model=GEOIDS,
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

    update_timestamp(session, document_id, data.updated_at)
    session.commit()
    return {"geoids": results[0], "updated_at": data.updated_at}


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

    session.commit()

    return {"message": "Assignments partition reset", "document_id": document_id}


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
        .join(
            DistrictrMap,
            Document.gerrydb_table == DistrictrMap.gerrydb_table_name,
        )
        .outerjoin(ParentChildEdges, Assignments.geo_id == ParentChildEdges.child_path)
        .where(
            Assignments.document_id == document_id,
        )
    )

    results = session.exec(stmt)
    return results


@app.get("/api/document/{document_id}", response_model=DocumentPublic)
async def get_document(document_id: str, session: Session = Depends(get_session)):
    stmt = (
        select(
            Document.document_id,
            Document.created_at,
            Document.gerrydb_table,
            Document.updated_at,
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
    results = session.execute(
        stmt, {"doc_uuid": document_id, "exclude_ids": exclude_ids}
    ).fetchall()
    # returns a list of multipolygons of bboxes
    return {"features": [row[0] for row in results]}


@app.get("/api/document/{document_id}/evaluation/{summary_stat}")
async def get_summary_stat(
    document_id: str, summary_stat: str, session: Session = Depends(get_session)
):
    try:
        _summary_stat = SummaryStatisticType[summary_stat]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid summary_stat: {summary_stat}",
        )

    try:
        stmt, SummaryStatsModel = {
            "P1": (
                text(
                    "SELECT * from get_summary_stats_p1(:document_id) WHERE zone is not null"
                ),
                SummaryStatsP1,
            ),
            "P4": (
                text(
                    "SELECT * from get_summary_stats_p4(:document_id) WHERE zone is not null"
                ),
                SummaryStatsP4,
            ),
        }[summary_stat]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Summary stats not implemented for {summary_stat}",
        )

    try:
        results = session.execute(stmt, {"document_id": document_id}).fetchall()
        return {
            "summary_stat": _summary_stat.value,
            "results": [SummaryStatsModel.model_validate(row) for row in results],
        }
    except (ProgrammingError, InternalError) as e:
        logger.error(e)
        error_text = str(e)
        if f"Table name not found for document_id: {document_id}" in error_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID {document_id} not found",
            )


@app.get("/api/districtrmap/{gerrydb_table}/evaluation/{summary_stat}")
async def get_gerrydb_summary_stat(
    gerrydb_table: str, summary_stat: str, session: Session = Depends(get_session)
):
    try:
        _summary_stat = SummaryStatisticType[summary_stat]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid summary_stat: {summary_stat}",
        )

    try:
        summary_stat_udf, SummaryStatsModel = {
            "P1": ("get_summary_p1_totals", PopulationStatsP1),
            "P4": ("get_summary_p4_totals", PopulationStatsP4),
        }[summary_stat]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Summary stats not implemented for {summary_stat}",
        )

    stmt = text(
        f"""SELECT *
        FROM {summary_stat_udf}(:gerrydb_table)"""
    ).bindparams(
        bindparam(key="gerrydb_table", type_=String),
    )
    try:
        results = session.execute(stmt, {"gerrydb_table": gerrydb_table}).fetchone()
        return {
            "summary_stat": _summary_stat.value,
            "results": SummaryStatsModel.model_validate(results),
        }
    except (ProgrammingError, InternalError) as e:
        logger.error(e)
        error_text = str(e)
        if f"Table {gerrydb_table} does not exist in gerrydb schema" in error_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Gerrydb Table with ID {gerrydb_table} not found",
            )

# FOR DEBUG ONLY DON'T USE IN PRODUCTION
@app.get("/api/gerrydb/dump/{gerrydb_table}")
async def get_gerrydb_dump(
    gerrydb_table: str, session: Session = Depends(get_session)
):
    stmt = text(
        f"""SELECT path, total_pop
        FROM gerrydb.{gerrydb_table}"""
    )
    try:
        results = session.execute(stmt).fetchall()
        return [{"path": r[0], "total_pop": r[1]} for r in results]
    except (ProgrammingError, InternalError) as e:
        logger.error(e)
        error_text = str(e)
        if f"Table {gerrydb_table} does not exist in gerrydb schema" in error_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Gerrydb Table with ID {gerrydb_table} not found",
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

        media_type = {
            DocumentExportFormat.csv: "text/csv; charset=utf-8",
            DocumentExportFormat.geojson: "application/json",
        }.get(_format, "text/plain; charset=utf-8")
        return FileResponse(
            path=_out_file, media_type=media_type, filename=out_file_name
        )
