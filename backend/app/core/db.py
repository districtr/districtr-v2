from sqlmodel import create_engine
from pymongo import MongoClient
from pymongo.database import Database

from app.core.config import settings
from app.models import PLAN_COLLECTION_NAME, PLAN_COLLECTION_SCHEMA

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), echo=True)


def get_mongo_database() -> Database:
    """
    Get MongoDB database.

    Returns:
        pymongo.database.Database: MongoDB database
    """
    client = MongoClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


def create_collections() -> None:
    """
    Create collections in MongoDB if they do not exist, otherwise apply migrations.
    """
    db = get_mongo_database()
    if PLAN_COLLECTION_NAME not in db.list_collection_names():
        db.create_collection(PLAN_COLLECTION_NAME, validator=PLAN_COLLECTION_SCHEMA)
        db[PLAN_COLLECTION_NAME].create_index("geoid", unique=True)
        print(f"Collection {PLAN_COLLECTION_NAME} created")
    else:
        db.command("collMod", PLAN_COLLECTION_NAME, validator=PLAN_COLLECTION_SCHEMA)
