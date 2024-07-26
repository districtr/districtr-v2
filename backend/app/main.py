from fastapi import FastAPI, status, Depends, HTTPException
from sqlalchemy import text
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
    stmt = select(Document).where(Document.document_id == document_id)
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


@app.patch("/api/update_assignments")
async def update_assignments(
    data: AssignmentsCreate, session: Session = Depends(get_session)
):
    stmt = insert(Assignments).values(data.model_dump()["assignments"])
    stmt = stmt.on_conflict_do_update(
        constraint=Assignments.__table__.primary_key, set_={"zone": stmt.excluded.zone}
    )
    session.execute(stmt)
    session.commit()
    return {"assignments_upserted": len(data.assignments)}


@app.get("/get_assignments/{document_id}", response_model=list[Assignments])
async def get_assignments(document_id: str, session: Session = Depends(get_session)):
    stmt = select(Assignments).where(Assignments.document_id == document_id)
    results = session.exec(stmt)
    # do we need to unpack returned assignments from returned results object?
    # I think probably?
    return results


@app.get("/api/document/{document_id}/total_pop", response_model=list[ZonePopulation])
async def get_total_population(
    document_id: str, session: Session = Depends(get_session)
):
    stmt = text("SELECT * from get_total_population(:document_id)")
    result = session.execute(stmt, {"document_id": document_id})
    return [ZonePopulation(zone=zone, total_pop=pop) for zone, pop in result.fetchall()]
