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


# there's a related concept of the sandbox people are working in
# what happens with historical maps?


class DistrictrView(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    name: str | None = Field(nullable=False)
    num_districts: int | None = Field(nullable=True, default=None)
    tiles_s3_path: str | None = Field(nullable=True)
    parent_layer: str = Field(nullable=True, foreign_key="gerrydb_table.uuid")
    child_layer: str | None = Field(nullable=True, foreign_key="gerrydb_table.uuid")
    # schema? will need to contrain the schema
    # where does this go?
    # when you create the view, pull the columns that you need
    # we'll want discrete management steps


class GerryDBTable(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    # Must correspond to the layer name in the tileset
    name: str = Field(nullable=False, unique=True)


class ParentChildEdges(TimeStampMixin, SQLModel, table=True):
    id: int = Field(primary_key=True)
    districtr_view: str = Field(nullable=False, foreign_key="districtr_view.uuid")
    parent_path: str
    child_path: str


class GerryDBViewPublic(BaseModel):
    name: str


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
    # tiles_s3_path: str | None = None


class AssignmentsBase(SQLModel):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str = Field(sa_column=Column(UUIDType, primary_key=True))
    geo_id: str = Field(primary_key=True)
    zone: int


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
