from datetime import datetime
from typing import Optional
from pydantic import UUID4, BaseModel
from sqlmodel import (
    Field,
    ForeignKey,
    SQLModel,
    UUID,
    TIMESTAMP,
    UniqueConstraint,
    text,
    Column,
    MetaData,
    String,
)
from sqlalchemy.types import ARRAY
from sqlalchemy import Float
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


class DistrictrMap(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    name: str = Field(nullable=False)
    # This is intentionally not a foreign key on `GerryDBTable` because in some cases
    # this may be the GerryDBTable but in others the pop table may be a materialized
    # view of two GerryDBTables in the case of shatterable maps.
    # We'll want to enforce the constraint tha the gerrydb_table_name is either in
    # GerrydbTable.name or a materialized view of two GerryDBTables some other way.
    gerrydb_table_name: str | None = Field(nullable=True, unique=True)
    # Null means default number of districts? Should we have a sensible default?
    num_districts: int | None = Field(nullable=True, default=None)
    tiles_s3_path: str | None = Field(nullable=True)
    parent_layer: str = Field(
        sa_column=Column(String, ForeignKey("gerrydbtable.name"), nullable=False)
    )
    child_layer: str | None = Field(
        sa_column=Column(
            String, ForeignKey("gerrydbtable.name"), default=None, nullable=True
        )
    )
    # schema? will need to contrain the schema
    # where does this go?
    # when you create the view, pull the columns that you need
    # we'll want discrete management steps


class DistrictrMapPublic(BaseModel):
    name: str
    gerrydb_table_name: str
    parent_layer: str
    child_layer: str | None = None
    tiles_s3_path: str | None = None
    num_districts: int | None = None


class GerryDBTable(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    # Must correspond to the layer name in the tileset
    name: str = Field(nullable=False, unique=True)
    extent: list[float] = Field(
        sa_column=Column(ARRAY(Float), nullable=False)
    )  # at the gdb table level and not the doc level


class ParentChildEdges(TimeStampMixin, SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "districtr_map",
            "parent_path",
            "child_path",
            name="districtr_map_parent_child_edge_unique",
        ),
        {"postgresql_partition_by": "LIST (districtr_map)"},
    )
    districtr_map: str = Field(
        sa_column=Column(
            UUIDType,
            ForeignKey("districtrmap.uuid"),
            nullable=False,
            primary_key=True,
        )
    )
    parent_path: str = Field(sa_column=Column(String, nullable=False, primary_key=True))
    child_path: str = Field(sa_column=Column(String, nullable=False, primary_key=True))


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
    parent_layer: str
    child_layer: str | None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    created_at: datetime
    updated_at: datetime
    extent: list[float]


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


class AssignmentsResponse(SQLModel):
    geo_id: str
    zone: int | None
    parent_path: str | None
    document_id: str


class GEOIDS(BaseModel):
    geoids: list[str]


class ShatterResult(BaseModel):
    parents: GEOIDS
    children: list[Assignments]


class ZonePopulation(BaseModel):
    zone: int
    total_pop: int
