from fastapi import FastAPI, Depends, HTTPException
from pymongo.database import Database
from sqlmodel import Session
from starlette.middleware.cors import CORSMiddleware
import logging
from bson import ObjectId

from app.core.db import engine, get_mongo_database
from app.core.config import settings

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


def get_mongodb_client():
    yield get_mongo_database()


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/plan/{plan_id}")
async def get_plan(plan_id: str, mongodb: Database = Depends(get_mongodb_client)):
    plan = mongodb.plans.find_one({"_id": ObjectId(plan_id)})

    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    return str(plan)
