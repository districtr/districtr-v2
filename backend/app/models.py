from datetime import datetime
from typing import Optional, List
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

GEOID_TYPE = {
    "bsonType": "string",
    "maxLength": 20,
    "description": "must be a string with a maximum length of 20 characters and is required",
}

ZONE_TYPE = {
    "bsonType": "int",
    "minimum": 0,
    "maximum": 255,
    "description": "must be a uint8 (unsigned 8-bit integer) and is required",
}

PLAN_COLLECTION_NAME = "plans"

PLAN_COLLECTION_SCHEMA = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["assignments"],
        "properties": {
            "assignments": {
                "bsonType": "object",
                "required": ["geoid", "zone"],
                "properties": {"geoid": GEOID_TYPE, "zone": ZONE_TYPE},
            }
        },
    }
}


class Plan(BaseModel):
    geoid: str = PydanticField(max_length=20, description="Assignment geoid")
    zone: int = PydanticField(ge=0, le=255, description="Assignment zone")


class Assignments(BaseModel):
    assignments: List[Plan]
