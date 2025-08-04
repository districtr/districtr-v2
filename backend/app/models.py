from datetime import datetime
from typing import Optional
from pydantic import UUID4, BaseModel
from sqlmodel import (
    Field,
    ForeignKey,
    UniqueConstraint,
    Column,
    MetaData,
    String,
    Boolean,
    Integer,
    Text,
    Index,
)
from sqlalchemy.types import ARRAY
from sqlalchemy.dialects.postgresql import JSON, ENUM
from sqlalchemy import Float
import pydantic_geojson
from app.constants import DOCUMENT_SCHEMA
from app.core.models import UUIDType, TimeStampMixin, SQLModel
from app.save_share.models import (
    DocumentDraftStatus,
    DocumentEditStatus,
    DocumentShareStatus,
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
    map_type: str = Field(
        sa_column=Column(
            ENUM("default", "local", name="maptype"),
            nullable=False,
            server_default="default",
        )
    )


class DistrictrMapPublic(BaseModel):
    name: str
    districtr_map_slug: str
    gerrydb_table_name: str | None = None
    parent_layer: str
    child_layer: str | None = None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    visible: bool = True


class ConfigMapGroup(BaseModel):
    districtr_map_slug: str
    group_slug: str


class DistrictrMapUpdate(BaseModel):
    districtr_map_slug: str
    gerrydb_table_name: str | None
    name: str | None = None
    parent_layer: str | None = None
    child_layer: str | None = None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    visible: bool | None = None
    map_type: str = "default"


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
        Index(
            "idx_parentchildedges_child_path_districtr_map",
            "child_path",
            "districtr_map",
        ),
        {"postgresql_partition_by": "LIST (districtr_map)"},
    )
    __tablename__ = "parentchildedges"  # pyright: ignore

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


class DocumentMetadata(BaseModel):
    name: str | None = None
    group: str | None = None
    tags: list[str] | None = None
    description: str | None = None
    event_id: str | None = None
    draft_status: DocumentDraftStatus | None = DocumentDraftStatus.scratch
    district_comments: dict[int, str] | None = None
    location_comments: list[dict[str, str]] | None = None


class Document(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str = Field(
        sa_column=Column(UUIDType, unique=True, primary_key=True, nullable=False)
    )
    # All documents get a public id by default so we don't need to backfill this number
    # and the document id can remain the universal unique identifier for documents.
    # Whether the document can be accessed with the public id should be determined
    # in the API business logic.
    public_id: int = Field(
        sa_column=Column(
            Integer, nullable=False, unique=True, autoincrement=True, index=True
        )
    )
    districtr_map_slug: str = Field(
        sa_column=Column(
            Text,
            ForeignKey(DistrictrMap.districtr_map_slug),
            nullable=False,
        )
    )
    gerrydb_table: str | None = Field(nullable=True)
    color_scheme: list[str] | None = Field(
        sa_column=Column(ARRAY(String), nullable=True)
    )
    map_metadata: DocumentMetadata | None = Field(sa_column=Column(JSON, nullable=True))


class DocumentCreate(BaseModel):
    districtr_map_slug: str
    user_id: str
    metadata: Optional[DocumentMetadata] | None = None
    copy_from_doc: Optional[str | int] | None = None  # document_id to copy from
    assignments: list[list[str]] | None = None  # Option to load block assignments


class MapDocumentUserSession(TimeStampMixin, SQLModel, table=True):
    """
    Tracks the user session for a given document
    """

    __tablename__ = "map_document_user_session"  # pyright: ignore
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    session_id: int = Field(
        sa_column=Column(Integer, primary_key=True, autoincrement=True)
    )
    user_id: str = Field(sa_column=Column(String, nullable=False))
    document_id: str = Field(sa_column=Column(UUIDType, nullable=False))


class DocumentPublic(BaseModel):
    document_id: UUID4 | str
    public_id: int | None = None
    districtr_map_slug: str | None
    gerrydb_table: str | None
    parent_layer: str
    child_layer: str | None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    created_at: datetime
    updated_at: datetime
    extent: list[float] | None = None
    map_metadata: DocumentMetadata | None
    status: DocumentEditStatus = (
        DocumentEditStatus.unlocked
    )  # locked, unlocked, checked_out
    genesis: str | None = None
    access: DocumentShareStatus = DocumentShareStatus.edit
    color_scheme: list[str] | None = None
    map_type: str
    map_module: str | None = None


class DocumentCreatePublic(DocumentPublic):
    inserted_assignments: int


class Assignments(SQLModel, table=True):
    # this is the empty parent table; not a partition itself
    __table_args__ = (
        UniqueConstraint("document_id", "geo_id", name="document_geo_id_unique"),
        {"postgresql_partition_by": "LIST (document_id)"},
    )
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str = Field(sa_column=Column(UUIDType, primary_key=True))
    geo_id: str = Field(primary_key=True)
    zone: int | None


class AssignmentsCreate(BaseModel):
    assignments: list[Assignments]
    user_id: str


class AssignmentsResponse(SQLModel):
    geo_id: str
    zone: int | None
    parent_path: str | None
    # document_id: str


class GEOIDS(BaseModel):
    geoids: list[str]


class GEOIDSResponse(GEOIDS):
    updated_at: datetime


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


class MapGroup(SQLModel, table=True):
    __tablename__ = "map_group"  # pyright: ignore
    slug: str = Field(primary_key=True, nullable=False)
    name: str = Field(nullable=False)


class DistrictrMapsToGroups(SQLModel, table=True):
    __tablename__ = "districtrmaps_to_groups"  # pyright: ignore
    districtrmap_uuid: str = Field(
        sa_column=Column(UUIDType, ForeignKey("districtrmap.uuid"), primary_key=True)
    )
    group_slug: str = Field(
        sa_column=Column(
            String,
            ForeignKey("map_group.slug"),
            primary_key=True,
        )
    )
