from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel, Field as PydanticField
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


class AssignmentsUpdate(BaseModel):
    """
    {
      acknowledged: true,
      insertedId: null,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0
    }
    """

    acknowledged: bool = PydanticField(description="Acknowledged")
    upserted_id: Optional[str] = PydanticField(description="Inserted ID")
    matched_count: int = PydanticField(description="Matched count")
    modified_count: int = PydanticField(description="Modified count")


class AssignmentsPublic(BaseModel):
    id: str = PydanticField(alias="_id", description="Assignment ID")
