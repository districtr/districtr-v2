from sqlmodel import create_engine
from pymongo import MongoClient, HASHED
from pymongo.database import Database

from app.core.config import settings
from app.models import PLAN_COLLECTION_NAME, PLAN_COLLECTION_SCHEMA

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), echo=True)


COLLECTIONS = {PLAN_COLLECTION_NAME: PLAN_COLLECTION_SCHEMA}


def get_mongo_database() -> Database:
    """
    Get MongoDB database.

    Returns:
        pymongo.database.Database: MongoDB database
    """
    client = MongoClient(settings.MONGODB_URI)
    return client[settings.MONGODB_DB]


def create_collections(collections: list[str] | None) -> None:
    """
    Create collections in MongoDB if they do not exist, otherwise apply migrations.

    Args:
        collections (list[str]): List of collection names
    """
    db = get_mongo_database()
    all_collections = list(COLLECTIONS.keys())

    if not collections:
        collections = all_collections

    for collection_name in collections:
        collection_schema = COLLECTIONS[collection_name]

        if collection_name not in db.list_collection_names():
            db.create_collection(collection_name, validator=collection_schema)
            print(f"Collection {collection_name} created")
        else:
            db.command("collMod", collection_name, validator=collection_schema)

    # Create indices
    collection = db[PLAN_COLLECTION_NAME]
    collection.create_index([("data.geoid", HASHED)], unique=False)
