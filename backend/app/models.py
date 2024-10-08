from datetime import datetime
from typing import Optional
from pydantic import UUID4, BaseModel
from sqlmodel import (
    Field,
    SQLModel,
    UUID,
    TIMESTAMP,
    UniqueConstraint,
    text,
    Column,
    MetaData,
)
from app.constants import DOCUMENT_SCHEMA


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


class GerryDBTable(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    name: str = Field(nullable=False, unique=True)
    tiles_s3_path: str | None = Field(nullable=True)


class GerryDBViewPublic(BaseModel):
    name: str
    tiles_s3_path: str | None


class Document(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str | None = Field(
        sa_column=Column(UUIDType, unique=True, primary_key=True)
    )
    gerrydb_table: str | None = Field(nullable=True)


class DocumentCreate(BaseModel):
    gerrydb_table: str | None


class DocumentPublic(BaseModel):
    document_id: UUID4
    gerrydb_table: str | None
    created_at: datetime
    updated_at: datetime
    tiles_s3_path: str | None = None


class AssignmentsBase(SQLModel):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str = Field(sa_column=Column(UUIDType, primary_key=True))
    geo_id: str = Field(primary_key=True)
    zone: int | None


class Assignments(AssignmentsBase, table=True):
    # this is the empty parent table; not a partition itself
    __table_args__ = (
        UniqueConstraint("document_id", "geo_id", name="document_geo_id_unique"),
        {"postgresql_partition_by": "LIST (document_id)"},
    )
    pass


class AssignmentsCreate(BaseModel):
    assignments: list[Assignments]


class ZonePopulation(BaseModel):
    zone: int
    total_pop: int
