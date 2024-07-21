from fastapi import FastAPI, status, Depends, HTTPException
from sqlalchemy import text
from sqlmodel import Session, select
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy.dialects.postgresql import insert
from typing import List
import logging

import sentry_sdk
from app.core.db import engine
from app.core.config import settings
from app.models import Assignments, Document

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


@app.post("/create_document")
async def create_document(session: Session = Depends(get_session)):
    doc = Document()
    session.add(doc)
    session.commit()
    session.refresh(doc)
    document_id = doc.document_id
    # Also create the partition in one go.
    session.execute(
        text(
            f"""
            CREATE TABLE assignments_{document_id} PARTITION OF assignments
            VALUES IN ('{document_id}')
        """
        )
    )
    return doc


@app.post("/update_assignments")
async def update_assignments(
    assignments: List[Assignments], session: Session = Depends(get_session)
):
    stmt = insert(Assignments).values(assignments)
    stmt = stmt.on_conflict_do_update(set_={"zone": stmt.excluded.zone})
    session.execute(stmt)
    session.commit()
    return assignments


@app.get("/get_assignemnts/{document_id}")
async def get_assignments(document_id: str, session: Session = Depends(get_session)):
    stmt = select(Assignments).where(Assignments.document_id == document_id)
    results = session.exec(stmt)
    # do we need to unpack returned assignments from returned results object?
    # I think probably?
    return results
