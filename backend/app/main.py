from fastapi import (
    FastAPI,
    status,
    Depends,
    HTTPException,
    Query,
    BackgroundTasks,
    Body,
)
import botocore.exceptions
from sqlalchemy.exc import MultipleResultsFound, NoResultFound
from fastapi.responses import FileResponse
from sqlalchemy import text, update
from sqlalchemy.exc import (
    ProgrammingError,
    InternalError,
    IntegrityError,
    SQLAlchemyError,
)
from pydantic import ValidationError
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
from app.core.db import engine
from app.core.config import settings
from app.utils import hash_password, verify_password
import jwt
from uuid import uuid4

from sqlalchemy.orm import sessionmaker
import app.contiguity.main as contiguity
from networkx import Graph
from app.models import (
    Assignments,
    AssignmentsCreate,
    AssignmentsResponse,
    DistrictrMap,
    Document,
    DocumentCreate,
    DocumentMetadata,
    DocumentPublic,
    DocumentEditStatus,
    GEOIDS,
    UserID,
    GEOIDSResponse,
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
    TokenRequest,
    DocumentShareStatus,
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


def check_map_lock(document_id, user_id, session):
    result = session.execute(
        text(
            # something is wrong with the conflict check
            """WITH ins AS (
                INSERT INTO document.map_document_user_session (document_id, user_id)
                SELECT :document_id, :user_id
                WHERE NOT EXISTS (
                    SELECT 1 FROM document.map_document_user_session WHERE document_id = :document_id
                )
                RETURNING user_id
            )
            SELECT user_id FROM ins
            UNION ALL
            SELECT user_id FROM document.map_document_user_session
            WHERE document_id = :document_id
            LIMIT 1;
            """
        ),
        {"document_id": document_id, "user_id": user_id},
    ).fetchone()

    status = (
        DocumentEditStatus.unlocked
        if result and result.user_id == user_id
        else DocumentEditStatus.locked
    )

    return status


# matches createMapObject in apiHandlers.ts
@app.post(
    "/api/create_document",
    response_model=DocumentPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_document(
    data: DocumentCreate, session: Session = Depends(get_session)
):
    try:
        results = session.execute(
            text("SELECT create_document(:gerrydb_table_name);"),
            {"gerrydb_table_name": data.gerrydb_table},
        )
        plan_genesis = "created"
        document_id = results.one()[0]  # should be only one row, one column of results

        lock_status = check_map_lock(document_id, data.user_id, session)

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
                Document.gerrydb_table,
                Document.updated_at,
                DistrictrMap.uuid.label("map_uuid"),  # pyright: ignore
                DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
                DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
                DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
                DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
                DistrictrMap.extent.label("extent"),  # pyright: ignore
                coalesce(plan_genesis).label("genesis"),
                DistrictrMap.available_summary_stats.label(
                    "available_summary_stats"
                ),  # pyright: ignore
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
    except Exception as e:
        logger.error(e)
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document creation failed",
        )


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
        .join(DistrictrMap, Document.gerrydb_table == DistrictrMap.gerrydb_table_name)
        .outerjoin(
            ParentChildEdges,
            (Assignments.geo_id == ParentChildEdges.child_path)
            & (ParentChildEdges.districtr_map == DistrictrMap.uuid),
        )
        .where(Assignments.document_id == document_id)
    )

    return session.execute(stmt).fetchall()


async def get_document(
    document_id: str,
    user_id: UserID,
    session: Session,
    shared: bool = False,
):
    lock_status = check_map_lock(document_id, user_id, session)

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
            DistrictrMap.available_summary_stats.label(
                "available_summary_stats"
            ),  # pyright: ignore
            # get metadata as a json object
            DocumentMetadata.map_metadata.label("map_metadata"),  # pyright: ignore
            coalesce(
                "shared" if shared else "created",
            ).label("genesis"),
            coalesce(
                lock_status,
            ).label("status"),
        )  # pyright: ignore
        .where(Document.document_id == document_id)
        .join(
            DistrictrMap,
            Document.gerrydb_table == DistrictrMap.gerrydb_table_name,
            isouter=True,
        )
        .join(
            DocumentMetadata,
            Document.document_id == DocumentMetadata.document_id,
            isouter=True,
        )
    )
    result = session.exec(stmt)

    return result.one()


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


@app.on_event("startup")
@repeat_every(seconds=60)  # Run every minute
def cleanup_expired_locks():
    session = next(get_session())
    try:
        N_HOURS = 1  # arbitrary for now
        stmt = text(
            """DELETE FROM document.map_document_user_session 
            WHERE updated_at < NOW() - make_interval(hours => :n_hours)"""
        )

        result = session.execute(stmt, {"n_hours": N_HOURS})
        session.commit()
        print(f"Deleted {result.rowcount} expired locks.")
    except Exception as e:
        session.rollback()
        print(f"Error deleting expired locks: {e}")


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
            Document.gerrydb_table
            == DistrictrMap.gerrydb_table_name,  # pyright: ignore
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
        sql = text(
            """
            select zone, array_agg(geo_id) as nodes
            from assignments
            where document_id = :document_id group by zone
            and zone is not null"""
        )
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


@app.put("/api/document/{document_id}/metadata", status_code=status.HTTP_200_OK)
async def update_districtrmap_metadata(
    document_id: str,
    metadata: dict = Body(...),
    session: Session = Depends(get_session),
):
    try:
        if not document_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Missing document_id"
            )
        try:
            metadata_obj = DocumentMetadata.from_dict(
                {"document_id": document_id, "map_metadata": metadata}
            )
        except ValidationError as ve:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid metadata format: {ve.errors()}",
            )

        # Create or update metadata record
        stmt = insert(DocumentMetadata).values(
            document_id=document_id, map_metadata=metadata_obj.map_metadata.dict()
        )

        stmt = stmt.on_conflict_do_update(
            index_elements=["document_id"],
            set_={"map_metadata": stmt.excluded.map_metadata},
        )

        session.execute(stmt)
        session.commit()

    except IntegrityError as ie:
        session.rollback()
        logger.error(f"Database integrity error: {ie}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflict: Metadata entry already exists or violates constraints",
        )

    except SQLAlchemyError as se:
        session.rollback()
        logger.error(f"Database error: {se}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A database error occurred while updating metadata",
        )

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


@app.post("/api/document/{document_id}/share")
async def share_districtr_plan(
    document_id: str,
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
        {"doc_id": document_id},
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
                "document_id": document_id,
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
    if result.password_hash:
        # password is required
        if data.password is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password required",
            )
        if not verify_password(data.password, result.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password",
            )

    # return the document to the user with the password
    return await get_document(
        str(result.document_id), data.user_id, session, shared=True
    )


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
