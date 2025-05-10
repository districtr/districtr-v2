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
    Boolean,
    Integer,
    Text,
)
from sqlalchemy.types import ARRAY
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy import Float
import pydantic_geojson
from app.constants import DOCUMENT_SCHEMA
from enum import Enum


class UUIDType(UUID):
    def __init__(self, *args, **kwargs):
        kwargs["as_uuid"] = False
        super().__init__(*args, **kwargs)


class DocumentShareStatus(str, Enum):
    read = "read"
    edit = "edit"


class TokenRequest(BaseModel):
    token: str
    password: str | None = None
    user_id: str | None = None
    access: DocumentShareStatus = DocumentShareStatus.read


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
    districtr_map_slug: str = Field(nullable=False, unique=True)
    # This is intentionally not a foreign key on `GerryDBTable` because in some cases
    # this may be the GerryDBTable but in others the pop table may be a materialized
    # view of two GerryDBTables in the case of shatterable maps.
    # We'll want to enforce the constraint tha the gerrydb_table_name is either in
    # GerrydbTable.name or a materialized view of two GerryDBTables some other way.
    gerrydb_table_name: str | None = Field(nullable=True)
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
    extent: list[float] | None = Field(sa_column=Column(ARRAY(Float), nullable=True))
    # schema? will need to contrain the schema
    # where does this go?
    # when you create the view, pull the columns that you need
    # we'll want discrete management steps
    visible: bool = Field(sa_column=Column(Boolean, nullable=False, default=True))


class DistrictrMapPublic(BaseModel):
    name: str
    districtr_map_slug: str
    gerrydb_table_name: str | None = None
    parent_layer: str
    child_layer: str | None = None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    visible: bool = True


class DistrictrMapUpdate(BaseModel):
    districtr_map_slug: str
    gerrydb_table_name: str | None
    name: str | None = None
    parent_layer: str | None = None
    child_layer: str | None = None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    visible: bool | None = None


class GerryDBTable(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    # Must correspond to the layer name in the tileset
    name: str = Field(nullable=False, unique=True)


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


class DistrictrMapMetadata(BaseModel):
    name: Optional[str] | None = None
    group: Optional[str] | None = None
    tags: Optional[list[str]] | None = None
    description: Optional[str] | None = None
    event_id: Optional[str] | None = None
    is_draft: bool = True


class Document(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str | None = Field(
        sa_column=Column(UUIDType, unique=True, primary_key=True)
    )
    districtr_map_slug: str = Field(
        sa_column=Column(
            Text,
            ForeignKey("public.districtrmap.districtr_map_slug"),
            nullable=False,
        )
    )
    gerrydb_table: str | None = Field(nullable=True)
    color_scheme: list[str] | None = Field(
        sa_column=Column(ARRAY(String), nullable=True)
    )
    map_metadata: DistrictrMapMetadata | None = Field(
        sa_column=Column(JSON, nullable=True)
    )


class DocumentCreate(BaseModel):
    districtr_map_slug: str | None
    user_id: str | None
    metadata: Optional[DistrictrMapMetadata] | None = None
    copy_from_doc: Optional[str] | None = None  # document_id to copy from


class MapDocumentUserSession(TimeStampMixin, SQLModel, table=True):
    """
    Tracks the user session for a given document
    """

    __tablename__ = "map_document_user_session"
    session_id: int = Field(
        sa_column=Column(Integer, primary_key=True, autoincrement=True)
    )
    user_id: str = Field(sa_column=Column(String, nullable=False))


class MapDocumentToken(TimeStampMixin, SQLModel, table=True):
    """
    Manages sharing of plans between users.

    Deliberately no user id for now, so that a user could theoretically re-access a plan from another machine.
    """

    __tablename__ = "map_document_token"
    token_id: str = Field(
        UUIDType,
        primary_key=True,
    )
    password_hash: str = Field(
        sa_column=Column(String, nullable=True)  # optional password
    )
    expiration_date: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True)
    )


class DocumentEditStatus(str, Enum):
    locked = "locked"
    unlocked = "unlocked"
    checked_out = "checked_out"


class DocumentGenesis(str, Enum):
    created = "created"
    shared = "shared"


class DocumentPublic(BaseModel):
    document_id: UUID4
    districtr_map_slug: str | None
    gerrydb_table: str | None
    parent_layer: str
    child_layer: str | None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    created_at: datetime
    updated_at: datetime
    extent: list[float] | None = None
    map_metadata: DistrictrMapMetadata | None
    status: DocumentEditStatus = (
        DocumentEditStatus.unlocked
    )  # locked, unlocked, checked_out
    genesis: str | None = None
    access: DocumentShareStatus = DocumentShareStatus.edit
    color_scheme: list[str] | None = None


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


class AssignmentsBulkUpload(BaseModel):
    assignments: list[list[str]]
    gerrydb_table_name: str


class AssignmentsResponse(SQLModel):
    geo_id: str
    zone: int | None
    parent_path: str | None
    document_id: str


class GEOIDS(BaseModel):
    geoids: list[str]


class GEOIDSResponse(GEOIDS):
    updated_at: datetime


class UserID(BaseModel):
    user_id: str


class AssignedGEOIDS(GEOIDS):
    zone: int | None


class BBoxGeoJSONs(BaseModel):
    features: list[
        pydantic_geojson.feature.FeatureModel
        | pydantic_geojson.multi_polygon.MultiPolygonModel
        | pydantic_geojson.polygon.PolygonModel
    ]


class ShatterResult(BaseModel):
    parents: GEOIDS
    children: list[Assignments]
    updated_at: datetime


class ColorsSetResult(BaseModel):
    colors: list[str]
