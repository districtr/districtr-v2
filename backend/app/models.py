from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel, Field as PydanticField, ValidationError
from pymongo.results import InsertOneResult
from sqlmodel import Field, SQLModel, UUID, TIMESTAMP, text

# Postgres


class UUIDType(UUID):
    def __init__(self, *args, **kwargs):
        kwargs["as_uuid"] = False
        super().__init__(*args, **kwargs)


class TimeStampMixin(SQLModel):
    created_at: Optional[datetime] = Field(
        sa_type=TIMESTAMP(timezone=True),
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        },
        nullable=False,
        default=None,
    )

    updated_at: Optional[datetime] = Field(
        sa_type=TIMESTAMP(timezone=True),
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        },
        nullable=False,
        default=None,
    )


# MongoDB

PLAN_COLLECTION_NAME = "plans"

PLAN_COLLECTION_SCHEMA = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["assignments"],
        "properties": {
            "assignments": {
                "bsonType": "object",
                "additionalProperties": {"bsonType": "int"},
            }
        },
    }
}


class Assignments(BaseModel):
    assignments: Dict[str, int] = PydanticField(description="Assignments dictionary")


class AssignmentsCreate(Assignments):
    pass


class AssignmentsUpdate(Assignments):
    id: str = PydanticField(alias="_id", description="Assignment ID")


class AssignmentsPublic(BaseModel):
    id: str = PydanticField(alias="_id", description="Assignment ID")

    @classmethod
    def from_insert_one(cls, insert_one: InsertOneResult):
        try:
            return cls(_id=str(insert_one.inserted_id))
        except Exception as e:
            raise ValidationError(e)
