from fastapi import FastAPI, status, Depends, HTTPException, Query
from pydantic import UUID4
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlmodel import Session, select
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert
import logging

import sentry_sdk
from app.core.db import engine
from app.core.config import settings
from app.models import (
    Assignments,
    AssignmentsCreate,
    Document,
    DocumentCreate,
    DocumentPublic,
    ZonePopulation,
    GerryDBTable,
    GerryDBViewPublic,
)

if settings.ENVIRONMENT == "production":
    sentry_sdk.init(
        dsn="https://b14aae02017e3a9c425de4b22af7dd0c@o4507623009091584.ingest.us.sentry.io/4507623009746944",
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
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
            Document.updated_at,
            Document.gerrydb_table,
            GerryDBTable.tiles_s3_path,
        )
        .where(Document.document_id == document_id)
        .join(GerryDBTable, Document.gerrydb_table == GerryDBTable.name, isouter=True)
        .limit(1)
    )
    doc = session.exec(
        stmt
    ).one()  # again if we've got more than one, we have problems.
    if not doc.document_id:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document creation failed",
        )
    session.commit()
    return doc


@app.patch("/api/update_document/{document_id}", response_model=DocumentPublic)
async def update_document(
    document_id: UUID4, data: DocumentCreate, session: Session = Depends(get_session)
):
    # Validate that gerrydb_table exists?
    stmt = text("""UPDATE document.document
        SET
            gerrydb_table = :gerrydb_table_name,
            updated_at = now()
        WHERE document_id = :document_id
        RETURNING *""")
    results = session.execute(
        stmt, {"document_id": document_id, "gerrydb_table_name": data.gerrydb_table}
    )
    db_document = results.first()
    if not db_document:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    session.commit()
    return db_document


@app.patch("/api/update_assignments")
async def update_assignments(
    data: AssignmentsCreate, session: Session = Depends(get_session)
):
    stmt = insert(Assignments).values(data.model_dump()["assignments"])
    stmt = stmt.on_conflict_do_update(
        constraint=Assignments.__table__.primary_key, set_={"zone": stmt.excluded.zone}
    )
    session.exec(stmt)
    session.commit()
    return {"assignments_upserted": len(data.assignments)}


# called by getAssignments in apiHandlers.ts
@app.get("/api/get_assignments/{document_id}", response_model=list[Assignments])
async def get_assignments(document_id: str, session: Session = Depends(get_session)):
    stmt = select(Assignments).where(Assignments.document_id == document_id)
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
            GerryDBTable.tiles_s3_path.label("tiles_s3_path"),
        )
        .where(Document.document_id == document_id)
        .join(GerryDBTable, Document.gerrydb_table == GerryDBTable.name, isouter=True)
        .limit(1)
    )
    result = session.exec(stmt)
    return result.one()


@app.get("/api/document/{document_id}/total_pop", response_model=list[ZonePopulation])
async def get_total_population(
    document_id: str, session: Session = Depends(get_session)
):
    stmt = text("SELECT * from get_total_population(:document_id)")
    try:
        result = session.execute(stmt, {"document_id": document_id})
        return [
            ZonePopulation(zone=zone, total_pop=pop) for zone, pop in result.fetchall()
        ]
    except ProgrammingError as e:
        logger.error(e)
        if f"Table name not found for document_id: {document_id}" in str(e):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID {document_id} not found",
            )


@app.get("/api/gerrydb/views", response_model=list[GerryDBViewPublic])
async def get_projects(
    *,
    session: Session = Depends(get_session),
    offset: int = 0,
    limit: int = Query(default=100, le=100),
):
    gerrydb_views = session.exec(
        select(GerryDBTable)
        .order_by(GerryDBTable.created_at.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return gerrydb_views
