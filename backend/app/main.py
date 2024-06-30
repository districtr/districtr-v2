from fastapi import FastAPI, status, Depends, HTTPException
from pymongo.database import Database
from sqlmodel import Session
from starlette.middleware.cors import CORSMiddleware
import logging
from bson import ObjectId

from app.core.db import engine, get_mongo_database
from app.core.config import settings
from app.models import AssignmentsCreate, AssignmentsPublic, AssignmentsUpdate

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


@app.post(
    "/plan",
    status_code=status.HTTP_201_CREATED,
    response_model=AssignmentsPublic,
)
async def create_plan(
    *, data: AssignmentsCreate, mongodb: Database = Depends(get_mongodb_client)
):
    db_plan = AssignmentsCreate.model_validate(data)
    plan = mongodb.plans.insert_one(db_plan.model_dump())
    return AssignmentsPublic(_id=str(plan.inserted_id))


@app.put(
    "/plan/{plan_id}",
    status_code=status.HTTP_200_OK,
    response_model=AssignmentsUpdate,
)
async def update_plan(
    *,
    plan_id: str,
    data: AssignmentsCreate,
    mongodb: Database = Depends(get_mongodb_client),
):
    db_plan = AssignmentsCreate.model_validate(data)
    new_assignments = {f"assignments.{k}": v for k, v in db_plan.assignments.items()}
    print(new_assignments)
    result = mongodb.plans.update_many(
        {"_id": ObjectId(plan_id)}, {"$set": new_assignments}, upsert=True
    )
    print(result)
    print("RAW RESULT", result.raw_result)
    return AssignmentsUpdate(
        acknowledged=result.acknowledged,
        inserted_id=result.upserted_id,
        matched_count=result.matched_count,
        modified_count=result.modified_count,
    )
