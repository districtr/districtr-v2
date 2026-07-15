from datetime import datetime
from enum import Enum, StrEnum
import re
import unicodedata
from pydantic import BaseModel, field_validator
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
from sqlalchemy import Float, SmallInteger, text
import pydantic_geojson
from app.constants import DOCUMENT_SCHEMA
from app.core.models import UUIDType, TimeStampMixin, SQLModel
from app.save_share.models import (
    DocumentDraftStatus,
    DocumentShareStatus,
)
from geoalchemy2 import Geometry


MAX_COMMUNITY_NAME_LENGTH = 40
COMMUNITY_HTML_TAG_RE = re.compile(r"<[^>]+>")
COMMUNITY_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
COMMUNITY_WHITESPACE_RE = re.compile(r"\s+")


class GeoUnitType(StrEnum):
    VTD = "vtd"
    BLOCK_GROUP = "bg"
    BLOCK = "block"


def sanitize_community_name(name: str) -> str:
    """Normalize user-provided community names before validation/persistence.

    Strips HTML tags, control characters, and Unicode format codepoints
    (category Cf — bidi overrides, zero-width joiners, BOM, etc.) that NFKC
    normalization does not fold and would otherwise let a name spoof its
    rendered form or bury hidden bytes past the length cap.
    """
    normalized = unicodedata.normalize("NFKC", name)
    without_tags = COMMUNITY_HTML_TAG_RE.sub("", normalized)
    # Collapse all whitespace (including tabs, newlines) to single spaces first,
    # then remove remaining non-whitespace control characters.
    collapsed_whitespace = COMMUNITY_WHITESPACE_RE.sub(" ", without_tags)
    without_control_chars = COMMUNITY_CONTROL_CHAR_RE.sub("", collapsed_whitespace)
    without_format_chars = "".join(
        c for c in without_control_chars if unicodedata.category(c) != "Cf"
    )
    return without_format_chars.strip()


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
    # If False, users cannot change the number of districts on the frontend.
    num_districts_modifiable: bool = Field(
        sa_column=Column(Boolean, nullable=False, server_default="true")
    )
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
            ENUM("default", "local", "community", name="maptype"),
            nullable=False,
            server_default="default",
        )
    )
    # Additional comments as necessary for module limitations
    comment: str | None = Field(nullable=True)
    # Census unit (usually VTDs) that the parent layer is made up of
    parent_geo_unit_type: GeoUnitType | None = Field(
        sa_column=Column(String, nullable=True)
    )
    # Census unit (usually blocks) that the child layer is made up of
    child_geo_unit_type: GeoUnitType | None = Field(
        sa_column=Column(String, nullable=True)
    )
    # Name of the data source for the map
    data_source_name: str | None = Field(nullable=True)
    # State FIPS codes associated with this map
    statefps: list[str] | None = Field(sa_column=Column(ARRAY(String), nullable=True))
    # Maximum length of a comment
    comment_length_limit: int | None = Field(nullable=True)
    # Maximum number of comments per document
    comment_count_limit: int | None = Field(nullable=True)


class DistrictrMapPublic(BaseModel):
    name: str
    districtr_map_slug: str
    gerrydb_table_name: str | None = None
    parent_layer: str
    child_layer: str | None = None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    num_districts_modifiable: bool = True
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
    num_districts_modifiable: bool | None = None
    visible: bool | None = None
    map_type: str = "default"
    comment: str | None = None
    parent_geo_unit_type: GeoUnitType | None = None
    child_geo_unit_type: GeoUnitType | None = None
    data_source_name: str | None = None
    statefps: list[str] | None = None
    comment_length_limit: int | None = None
    comment_count_limit: int | None = None


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
    __tablename__ = "parentchildedges"

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


class CommunityMetadata(BaseModel):
    id: int
    render_order_id: int
    name: str
    description: str
    color: str
    createdAt: str
    descriptionCommentId: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        if isinstance(value, str):
            return sanitize_community_name(value)
        return value

    @field_validator("id")
    @classmethod
    def positive_id(cls, value: int) -> int:
        # id <= 0 is reserved: 0 is the "unassigned" sentinel used on the
        # assignments side, and negative ids are reserved for future system use.
        if value <= 0:
            raise ValueError(
                "Community id must be a positive integer; "
                "ids <= 0 are reserved (0 is the unassigned sentinel)."
            )
        return value


class DocumentType(str, Enum):
    DISTRICT = "district"
    COI = "coi"


class Document(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str = Field(
        sa_column=Column(UUIDType, unique=True, primary_key=True, nullable=False)
    )
    # All documents get a public id by default so we don't need to backfill this number
    # and the document id can remain the universal unique identifier for documents.
    # Whether the document can be accessed with the public id should be determined
    # in the API business logic.
    public_id: int | None = Field(
        default=None,
        sa_column=Column(
            Integer,
            nullable=False,
            unique=True,
            autoincrement=True,
            index=True,
            server_default=text("nextval('document.document_public_id_seq')"),
        ),
    )
    districtr_map_slug: str = Field(
        sa_column=Column(
            Text,
            ForeignKey(DistrictrMap.districtr_map_slug),
            nullable=False,
        )
    )
    map_type: str = Field(
        sa_column=Column(
            ENUM("default", "local", "community", name="maptype", create_type=False),
            nullable=False,
            server_default="default",
        )
    )
    gerrydb_table: str | None = Field(nullable=True)
    num_districts: int | None = Field(nullable=True, default=None)
    num_communities: int | None = Field(nullable=True, default=None)
    color_scheme: list[str] | None = Field(
        sa_column=Column(ARRAY(String), nullable=True)
    )
    community_metadata_list: list[CommunityMetadata] | None = Field(
        sa_column=Column(JSON, nullable=True)
    )
    map_metadata: DocumentMetadata | None = Field(sa_column=Column(JSON, nullable=True))
    document_type: DocumentType = Field(
        sa_column=Column(
            ENUM(
                DocumentType.DISTRICT.value,
                DocumentType.COI.value,
                name="documenttype",
                create_type=False,
            ),
            nullable=False,
            server_default=DocumentType.DISTRICT.value,
        )
    )


class DocumentCreate(BaseModel):
    districtr_map_slug: str
    map_type: str | None = None
    document_type: DocumentType | None = None
    metadata: DocumentMetadata | None = None
    copy_from_doc: str | int | None = None  # document_id to copy from
    assignments: list[list[str]] | None = None  # Option to load block assignments


# TODO: Remove this table
class MapDocumentUserSession(TimeStampMixin, SQLModel, table=True):
    """
    Tracks the user session for a given document
    """

    __tablename__ = "map_document_user_session"
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    session_id: int = Field(
        sa_column=Column(Integer, primary_key=True, autoincrement=True)
    )
    user_id: str = Field(sa_column=Column(String, nullable=False))
    document_id: str = Field(sa_column=Column(UUIDType, nullable=False))


class DocumentCommentPublic(BaseModel):
    """Public representation of a document comment."""

    comment_id: str
    zone: int | None = None
    text: str
    moderated: bool = False  # True when comment failed moderation; edit access sees full text, public sees placeholder
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DocumentCommentCreate(BaseModel):
    """Create/update a document comment. If comment_id is provided, it's an update."""

    comment_id: int | None = None
    zone: int | None = None
    text: str


class DocumentPublic(BaseModel):
    document_id: str
    public_id: int | None = None
    districtr_map_slug: str | None
    gerrydb_table: str | None
    parent_layer: str
    child_layer: str | None
    tiles_s3_path: str | None = None
    num_districts: int | None = None
    num_communities: int | None = None
    community_metadata_list: list[CommunityMetadata] | None = None
    num_districts_modifiable: bool = True
    created_at: datetime
    updated_at: datetime
    extent: list[float] | None = None
    map_metadata: DocumentMetadata | None
    access: DocumentShareStatus = DocumentShareStatus.edit
    # True when an edit password is set, so read-only viewers can be offered an
    # "unlock to edit" affordance. The hash itself is never exposed.
    password_required: bool = False
    color_scheme: list[str] | None = None
    map_type: str
    document_type: DocumentType = DocumentType.DISTRICT
    map_module: str | None = None
    comment: str | None = None
    parent_geo_unit_type: GeoUnitType | None = None
    child_geo_unit_type: GeoUnitType | None = None
    data_source_name: str | None = None
    overlays: list["OverlayPublic"] | None = None
    statefps: list[str] | None = None
    document_comments: list["DocumentCommentPublic"] | None = None
    community_name_length_limit: int = MAX_COMMUNITY_NAME_LENGTH
    comment_length_limit: int | None = None
    comment_count_limit: int | None = None


class DocumentCreatePublic(DocumentPublic):
    inserted_assignments: int
    skipped_geo_ids: list[str] = []
    zone_label_remapping: dict[str, int] = {}


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


class CommunityAssignments(SQLModel, table=True):
    __tablename__ = "community_assignments"
    __table_args__ = (
        Index(
            "ix_document_community_assignments_community_id",
            "community_id",
        ),
        Index(
            "ix_document_community_assignments_geo_id",
            "geo_id",
        ),
        UniqueConstraint(
            "document_id",
            "community_id",
            "geo_id",
            name="document_community_geo_id_unique",
        ),
        {"postgresql_partition_by": "LIST (document_id)"},
    )
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    document_id: str = Field(sa_column=Column(UUIDType, primary_key=True))
    community_id: int = Field(
        sa_column=Column(SmallInteger, primary_key=True, nullable=False)
    )
    geo_id: str = Field(sa_column=Column(String, primary_key=True, nullable=False))


class AssignmentsMetadata(BaseModel):
    color_scheme: list[str] | None = None
    num_districts: int | None = None
    num_communities: int | None = None
    community_metadata_list: list[CommunityMetadata] | None = None


class AssignmentsCreate(BaseModel):
    document_id: str
    assignments: list[list[str | int | None]]  # [[geo_id, zone], ...]
    last_updated_at: datetime
    overwrite: bool = False
    map_type: str | None = None
    metadata: AssignmentsMetadata | None = None
    comments: list[DocumentCommentCreate] | None = None


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


class ShatterResult(BaseModel):
    parent_path: str
    child_path: str


class BBoxGeoJSONs(BaseModel):
    features: list[
        pydantic_geojson.feature.FeatureModel
        | pydantic_geojson.multi_polygon.MultiPolygonModel
        | pydantic_geojson.polygon.PolygonModel
    ]


class ColorsSetResult(BaseModel):
    colors: list[str]


class NumDistrictsSetResult(BaseModel):
    num_districts: int


class MapGroup(SQLModel, table=True):
    __tablename__ = "map_group"
    slug: str = Field(primary_key=True, nullable=False)
    name: str = Field(nullable=False)


class DistrictrMapsToGroups(SQLModel, table=True):
    __tablename__ = "districtrmaps_to_groups"
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


class DistrictrMapOverlays(SQLModel, table=True):
    __tablename__ = "districtrmap_overlays"
    districtr_map_id: str = Field(
        sa_column=Column(
            UUIDType,
            ForeignKey("districtrmap.uuid", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    overlay_id: str = Field(
        sa_column=Column(
            UUIDType,
            ForeignKey("overlay.overlay_id", ondelete="CASCADE"),
            primary_key=True,
        )
    )


class Overlay(TimeStampMixin, SQLModel, table=True):
    __tablename__ = "overlay"
    overlay_id: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    name: str = Field(nullable=False)
    description: str | None = Field(nullable=True)
    data_type: str = Field(
        sa_column=Column(
            ENUM("geojson", "pmtiles", name="overlaydatatype", create_type=False),
            nullable=False,
        )
    )
    layer_type: str = Field(
        sa_column=Column(
            ENUM("fill", "line", "text", name="overlaylayertype", create_type=False),
            nullable=False,
        )
    )
    custom_style: dict | None = Field(sa_column=Column(JSON, nullable=True))
    source: str | None = Field(nullable=True)
    source_layer: str | None = Field(nullable=True)
    id_property: str | None = Field(nullable=True)  # Property name for text labels


class OverlayPublic(BaseModel):
    overlay_id: str
    name: str
    description: str | None
    data_type: str
    layer_type: str
    custom_style: dict | None
    source: str | None
    source_layer: str | None
    id_property: str | None


class DistrictUnions(TimeStampMixin, SQLModel, table=True):
    __tablename__ = "district_unions"
    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    id: int = Field(sa_column=Column(Integer, primary_key=True, autoincrement=True))
    document_id: str = Field(
        sa_column=Column(
            UUIDType, ForeignKey(Document.document_id), index=True, nullable=False
        )
    )
    zone: int | None = Field(nullable=True)
    geometry: str | None = Field(
        sa_column=Column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    )
    # Store demographic data as JSONB since different tables have different columns
    demographic_data: dict | None = Field(sa_column=Column(JSON, nullable=True))


class DistrictUnionsResponse(BaseModel):
    zone: int | None
    geometry: str | None
    demographic_data: dict[str, int] | None
    updated_at: datetime
