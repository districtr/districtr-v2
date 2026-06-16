import csv
import io
import json as json_mod
import logging
import re
import msgpack
from enum import Enum
from uuid import uuid4
from typing import Callable, List, NewType

from fastapi import BackgroundTasks
from sqlalchemy import text, update, Table, MetaData, func
from sqlalchemy import bindparam, Text
from sqlalchemy.types import UUID
from sqlmodel import Session, select, Float

from app.constants import GERRY_DB_SCHEMA, PUBLIC_SCHEMA
from typing import Iterable, Sequence
from fastapi import Response
from app.models import (
    UUIDType,
    DistrictrMap,
    DistrictrMapUpdate,
    Document,
    DistrictUnionsResponse,
    GeoUnitType,
)
from app.thumbnails.main import generate_thumbnail, THUMBNAIL_BUCKET
from app.core.config import settings

metadata = MetaData()
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class RowFormat(str, Enum):
    """Wire formats supported by `package_rows`."""

    msgpack = "msgpack"
    json = "json"
    csv = "csv"


def package_rows(
    rows: Iterable[Sequence],
    fmt: RowFormat = RowFormat.msgpack,
    columns: Sequence[str] | None = None,
    filename: str | None = None,
) -> Response:
    """Serialize tabular rows into the requested format and wrap them in a Response.

    Args:
        rows: Iterable of row sequences (e.g. SQLAlchemy Row objects or tuples).
        fmt: Output format — msgpack (default), json, or csv.
        columns: Optional column names. Used as keys for json objects and as the
            header row for csv. Ignored by msgpack, which always emits row tuples.
        filename: Optional download filename; sets Content-Disposition when given.

    Returns:
        A FastAPI Response with the serialized payload and matching media type.
    """
    tuples = [tuple(row) for row in rows]
    headers = (
        {"Content-Disposition": f'attachment; filename="{filename}"'}
        if filename
        else None
    )

    if fmt == RowFormat.msgpack:
        return Response(
            content=msgpack.packb(tuples, use_bin_type=True),
            media_type="application/msgpack",
            headers=headers,
        )

    if fmt == RowFormat.json:
        data = (
            [dict(zip(columns, row)) for row in tuples]
            if columns
            else [list(row) for row in tuples]
        )
        return Response(
            content=json_mod.dumps(data),
            media_type="application/json",
            headers=headers,
        )

    if fmt == RowFormat.csv:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        if columns:
            writer.writerow(columns)
        writer.writerows(tuples)
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers=headers,
        )

    raise ValueError(f"Unsupported row format: {fmt}")  # pragma: no cover


_SAFE_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

Geoid = NewType("Geoid", str)

# Predicates for identifying parent-unit geo_ids based on the document's parent_geo_unit_type.
GEOID_PREDICATES: dict[GeoUnitType, Callable[[Geoid], bool]] = {
    GeoUnitType.VTD: lambda geo_id: geo_id.startswith("vtd:"),
    GeoUnitType.BLOCK_GROUP: lambda geo_id: len(geo_id) == 12 and geo_id.isdigit(),
    GeoUnitType.BLOCK: lambda geo_id: len(geo_id) == 15 and geo_id.isdigit(),
}


def assert_safe_ident(name: str) -> str:
    """Assert that `name` is safe to interpolate into a SQL identifier position."""
    if not _SAFE_IDENT_RE.match(name):
        raise ValueError(f"Unsafe SQL identifier: {name!r}")
    return name


def infer_geo_unit_type(session: Session, layer_name: str) -> GeoUnitType:
    """Infer the geo unit type of a GerryDB layer by sampling one path value.

    Raises ValueError if the layer is empty or the path format is unrecognised.
    """
    safe = assert_safe_ident(layer_name)
    row = session.execute(
        text(f"SELECT path FROM gerrydb.{safe} LIMIT 1")
    ).one_or_none()
    if row is None:
        raise ValueError(f"Layer {layer_name!r} is empty or does not exist")
    path: str = row[0]
    for unit_type, predicate in GEOID_PREDICATES.items():
        if predicate(path):
            return unit_type
    raise ValueError(f"Unrecognised path format {path!r} in layer {layer_name!r}")


def get_gerrydb_numeric_cols(session: Session, gerrydb_table: str) -> list[str]:
    """Return validated numeric column names for a gerrydb table, excluding geometry columns."""
    rows = session.execute(
        text("""
            SELECT a.attname AS column_name
            FROM pg_attribute a
            JOIN pg_class t  ON a.attrelid = t.oid
            JOIN pg_namespace s ON t.relnamespace = s.oid
            WHERE a.attnum > 0
              AND NOT a.attisdropped
              AND t.relname = :mvname
              AND s.nspname = 'gerrydb'
              AND a.attname NOT IN ('geometry', 'geography', 'fid', 'path')
              AND pg_catalog.format_type(a.atttypid, a.atttypmod) IN (
                'double precision','integer','smallint','bigint',
                'decimal','numeric','real','smallserial','bigserial','serial'
              )
            ORDER BY a.attnum
        """),
        {"mvname": gerrydb_table},
    ).fetchall()
    return [assert_safe_ident(row.column_name) for row in rows]


def _quote_ident(name: str) -> str:
    """Quote a PostgreSQL identifier (double-quote and escape).

    This function carries a light SQL injection risk and should only be used
    with trusted input.

    Args:
        name (str): The name of the identifier to quote.

    Returns:
        str: The quoted identifier.
    """
    return '"' + name.replace('"', '""') + '"'


def create_districtr_map(
    session: Session,
    name: str,
    districtr_map_slug: str,
    parent_layer: str,
    child_layer: str | None = None,
    gerrydb_table_name: str | None = None,
    num_districts: int | None = None,
    tiles_s3_path: str | None = None,
    group_slug: str | None = None,
    map_type: str = "default",
    visibility: bool = True,
    statefps: list[str] | None = None,
    num_districts_modifiable: bool = True,
    comment_length_limit: int | None = None,
    comment_count_limit: int | None = None,
) -> str:
    """
    Create a new districtr map.

    Args:
        session: The database session.
        name: The name of the map.
        districtr_map_slug: The slug of the districtr map.
        parent_layer: The name of the parent layer.
        child_layer: The name of the child layer.
        gerrydb_table_name: The name of the gerrydb table.
        num_districts: The number of districts.
        tiles_s3_path: The S3 path to the tiles.
        group_slug: The slug of the map group.
        map_type: The type of map.
        visibility: The visibility of the map.
        statefps: The state FIPS codes associated with the map.
        num_districts_modifiable: If False, users cannot change the number of districts on the frontend.
        comment_length_limit: Max characters per comment (optional).
        comment_count_limit: Max comments per district (optional).

    Returns:
        The UUID of the inserted map.
    """
    map_uuid = str(uuid4())
    districtr_map = DistrictrMap(
        uuid=map_uuid,
        name=name,
        districtr_map_slug=districtr_map_slug,
        gerrydb_table_name=gerrydb_table_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
        parent_layer=parent_layer,
        child_layer=child_layer,
        visible=visibility,
        map_type=map_type,
        num_districts_modifiable=num_districts_modifiable,
        statefps=statefps,
        comment_length_limit=comment_length_limit,
        comment_count_limit=comment_count_limit,
        parent_geo_unit_type=infer_geo_unit_type(session, parent_layer),
        child_geo_unit_type=infer_geo_unit_type(session, child_layer)
        if child_layer
        else None,
    )
    session.add(districtr_map)
    session.flush()

    if group_slug is not None:
        add_districtr_map_to_map_group(
            session=session,
            districtr_map_slug=districtr_map_slug,
            group_slug=group_slug,
        )

    return districtr_map.uuid


def update_districtrmap(
    session: Session,
    districtr_map_slug: str,
    **kwargs,
):
    """
    Update a districtr map.

    Args:
        session: The database session.
        districtr_map_slug: The name of the gerrydb table.
        **kwargs: The fields to update.

    Returns:
        The updated districtr map.
    """
    data = DistrictrMapUpdate(districtr_map_slug=districtr_map_slug, **kwargs)
    update_districtrmap = data.model_dump(
        exclude_unset=True, exclude={"districtr_map_slug"}, exclude_none=True
    )

    if not update_districtrmap.keys():
        raise KeyError("No fields to update")

    stmt = (
        update(DistrictrMap)
        .where(DistrictrMap.districtr_map_slug == data.districtr_map_slug)  # type: ignore
        .values(update_districtrmap)
        .returning(DistrictrMap)
    )
    (updated_districtrmap,) = session.execute(stmt).one()

    return updated_districtrmap


def create_shatterable_gerrydb_view(
    session: Session,
    parent_layer: str,
    child_layer: str,
    gerrydb_table_name: str,
) -> None:
    stmt = text(
        "CALL create_shatterable_gerrydb_view(:parent_layer_name, :child_layer_name, :gerrydb_table_name)"
    ).bindparams(
        bindparam(key="parent_layer_name", type_=Text),
        bindparam(key="child_layer_name", type_=Text),
        bindparam(key="gerrydb_table_name", type_=Text),
    )
    session.execute(
        stmt,
        {
            "parent_layer_name": parent_layer,
            "child_layer_name": child_layer,
            "gerrydb_table_name": gerrydb_table_name,
        },
    )


def create_parent_child_edges(
    session: Session,
    districtr_map_uuid: str,
    force: bool = False,
) -> None:
    """
    Create the parent child edges for a given gerrydb map.

    Args:
        session: The database session.
        districtr_map_uuid: The UUID of the districtr map.
        force: If True, drop any previously loaded edges for this map and
            recreate them instead of raising when they already exist.
    """
    stmt = select(DistrictrMap).where(DistrictrMap.uuid == districtr_map_uuid)
    map_row = session.exec(stmt).one_or_none()

    if not map_row:
        raise ValueError(f"No districtrmap found for UUID: {districtr_map_uuid}")

    parent_layer, child_layer = (map_row.parent_layer, map_row.child_layer)
    if not parent_layer or not child_layer:
        raise ValueError("Districtr map must have both parent_layer and child_layer")

    # Check not already loaded
    count_stmt = text(
        """
        SELECT COUNT(*) > 0 FROM parentchildedges edges
        WHERE edges.districtr_map = :uuid
        """
    )
    previously_loaded = session.execute(
        count_stmt, {"uuid": districtr_map_uuid}
    ).scalar_one()

    uuid_str = str(districtr_map_uuid)
    partition_name = f"parentchildedges_{uuid_str}"

    if previously_loaded:
        if not force:
            raise ValueError(
                f"Relationships for districtr_map {districtr_map_uuid} already loaded"
            )
        logger.warning(
            f"Relationships for districtr_map {districtr_map_uuid} already loaded; "
            "force=True, dropping existing partition and reloading"
        )
        # Dropping the partition removes its rows, allowing the CREATE TABLE
        # below to recreate the partition from scratch.
        session.execute(text(f"DROP TABLE IF EXISTS {_quote_ident(partition_name)}"))

    create_sql = text(
        f"CREATE TABLE {_quote_ident(partition_name)} "
        f"PARTITION OF parentchildedges FOR VALUES IN ('{uuid_str}')"
    )
    session.execute(create_sql)

    # Use the session's connection for partition reflection so we see the
    # just-created table in the same transaction (other connections would not).
    conn = session.connection()
    parent = Table(parent_layer, metadata, schema=GERRY_DB_SCHEMA, autoload_with=conn)
    child = Table(child_layer, metadata, schema=GERRY_DB_SCHEMA, autoload_with=conn)
    partition = Table(
        partition_name, metadata, schema=PUBLIC_SCHEMA, autoload_with=conn
    )

    spatial_join = func.ST_Contains(
        parent.c.geometry, func.ST_PointOnSurface(child.c.geometry)
    )
    stmt = partition.insert().from_select(
        ["created_at", "districtr_map", "parent_path", "child_path"],
        select(
            func.now(),
            bindparam("uuid"),
            parent.c.path,
            child.c.path,
        )
        .select_from(parent)
        .join(child, spatial_join),
    )

    session.execute(stmt, params={"uuid": districtr_map_uuid})


def add_extent_to_districtrmap(
    session: Session, districtr_map_uuid: str | UUID, bounds: list[float] | None = None
) -> None:
    """
    Add the extent to the districtr map.

    Args:
        session: The database session.
        districtr_map_uuid: The UUID of the districtr map.
        bounds: The bounds of the map.
    """
    logger.info(f"Adding extent for {districtr_map_uuid}...")

    if bounds:
        assert all(
            b is not None for b in bounds
        ), "If setting the extent manually, all values must be set."
        assert len(bounds) == 4, "The extent must have 4 values."
        assert all(isinstance(b, float) for b in bounds), "All values must be floats."
        x_min, y_min, x_max, y_max = bounds
        assert (
            x_max > x_min and y_max > y_min
        ), "The max values must be greater than the min values."
        stmt = text(
            "UPDATE districtrmap SET extent = ARRAY[:x_min, :y_min, :x_max, :y_max] WHERE uuid = :districtr_map_uuid RETURNING extent"
        ).bindparams(
            bindparam(key="districtr_map_uuid", type_=UUIDType),
            bindparam(key="x_min", type_=Float),
            bindparam(key="y_min", type_=Float),
            bindparam(key="x_max", type_=Float),
            bindparam(key="y_max", type_=Float),
        )
        (result,) = session.execute(
            stmt,
            {
                "districtr_map_uuid": districtr_map_uuid,
                "x_min": x_min,
                "y_min": y_min,
                "x_max": x_max,
                "y_max": y_max,
            },
        ).one()
        logger.info(
            f"Updated extent for districtr map {districtr_map_uuid} to {result}"
        )
        return

    _select_result = session.execute(
        statement=text(
            "SELECT uuid FROM districtrmap WHERE uuid = :districtr_map_uuid"
        ).bindparams(bindparam(key="districtr_map_uuid", type_=UUIDType)),
        params={"districtr_map_uuid": districtr_map_uuid},
    ).scalar_one_or_none()
    if _select_result is None:
        raise ValueError(
            f"Districtr map with UUID {districtr_map_uuid} does not exist."
        )
    stmt = text(
        f"""
        DO $$
        DECLARE
            rec RECORD;
            layer_extent GEOMETRY;
        BEGIN
            SELECT uuid, parent_layer
            FROM districtrmap
            WHERE uuid = '{districtr_map_uuid}'::UUID
            INTO rec;

            EXECUTE format('
                SELECT ST_Transform(
                    ST_SetSRID(
                        ST_Extent(
                            geometry
                        ),
                        (SELECT ST_SRID(geometry) FROM gerrydb.%I WHERE geometry IS NOT NULL LIMIT 1)
                    ),
                    4326
                )
                FROM gerrydb.%I',
                rec.parent_layer,
                rec.parent_layer
            ) INTO layer_extent;

            UPDATE districtrmap
            SET extent = ARRAY[
                ST_XMin(layer_extent),
                ST_YMin(layer_extent),
                ST_XMax(layer_extent),
                ST_YMax(layer_extent)
            ]
            WHERE uuid = rec.uuid;

            EXCEPTION WHEN undefined_table THEN
                RAISE NOTICE 'Table % does not exist for layer %', rec.parent_layer, rec.name;
        END $$;
        """
    )
    session.execute(stmt)


def create_spatial_index(
    session: Session,
    table_name: str,
    schema: str = GERRY_DB_SCHEMA,
    geometry: str = "geometry",
    autocommit: bool = False,
):
    """
    Create a spatial index on the specified table.

    Args:
        session (Session): The database session.
        table_name (str): The name of the table to create the index on.
    """
    session.execute(
        text(f"CREATE INDEX ON {GERRY_DB_SCHEMA}.{table_name} USING GIST ({geometry})"),
    )
    if autocommit:
        session.commit()


def create_map_group(
    session: Session,
    group_name: str,
    slug: str,
    autocommit: bool = True,
):
    """
    Create a MapGroup which can organize multiple DistrictrMaps.

    Args:
        session (Session): The database session.
        group_name (str): The name of the group.
        slug (str): The slug for the group used in URLs and queries.
    """
    session.execute(
        text("INSERT INTO map_group (name, slug) VALUES (:group_name, :slug)"),
        {
            "group_name": group_name,
            "slug": slug,
        },
    )
    if autocommit:
        session.commit()


def add_districtr_map_to_map_group(
    session: Session, districtr_map_slug: str, group_slug: str, autocommit: bool = True
):
    districtr_map = session.exec(
        select(DistrictrMap).where(
            DistrictrMap.districtr_map_slug == districtr_map_slug  # pyright: ignore
        )
    ).one()
    existing_map_group = session.execute(
        text("""
        SELECT 1
        FROM districtrmaps_to_groups
        WHERE districtrmap_uuid = :uuid
        AND group_slug = :slug
    """),
        {
            "uuid": districtr_map.uuid,
            "slug": group_slug,
        },
    ).scalar_one_or_none()

    if existing_map_group:
        session.rollback()
        return

    group_stmt = text("""
        INSERT INTO districtrmaps_to_groups (group_slug, districtrmap_uuid)
        VALUES (:slug, :uuid)""")
    session.execute(
        group_stmt,
        {
            "uuid": districtr_map.uuid,
            "slug": group_slug,
        },
    )

    if autocommit:
        session.commit()


def update_or_select_district_stats(
    session: Session,
    document_id: str,
    background_tasks: BackgroundTasks,
) -> list[DistrictUnionsResponse]:
    """
    Update the district_unions materialized view for a document by creating
    unions of geometries grouped by zone, with demographic data aggregation.
    Returns the rows that were (re)inserted.
    """
    try:
        # If already up to date, just return what's there
        result = session.execute(
            text("""
            SELECT
                du.zone,
                ST_AsGeoJSON(du.geometry) AS geometry,
                du.demographic_data,
                du.updated_at
            FROM document.district_unions du
            JOIN document.document d ON du.document_id = d.document_id
            WHERE du.document_id = :document_id
              AND du.updated_at > d.updated_at
        """).bindparams(bindparam(key="document_id", type_=UUIDType)),
            {"document_id": document_id},
        )
        existing_mappings = result.mappings().all()
        if existing_mappings:
            return [
                DistrictUnionsResponse.model_validate(row) for row in existing_mappings
            ]

        # Clear existing data for this document
        session.execute(
            text(
                "DELETE FROM document.district_unions WHERE document_id = :document_id"
            ),
            {"document_id": document_id},
        )

        # Gather document + gerrydb table info
        doc_row = session.exec(
            select(
                Document,
                DistrictrMap.gerrydb_table_name.label("gerrydb_table_name"),
                DistrictrMap.parent_layer.label("parent_layer"),
            )
            .join(
                DistrictrMap,
                Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
            )
            .where(Document.document_id == document_id)
        ).one()
        gerrydb_table = doc_row.gerrydb_table_name
        parent_layer = doc_row.parent_layer

        # Discover numeric demographic columns (excluding geometry/fid/path)
        demographic_json = None
        if gerrydb_table:
            demo_cols = get_gerrydb_numeric_cols(session, gerrydb_table)
            if demo_cols:
                json_pairs = [f"'{col}', SUM(demo.{col})" for col in demo_cols]
                demographic_json = f"json_build_object({', '.join(json_pairs)})"

        # Build INSERT ... RETURNING to get created rows back
        # NOTE: We must interpolate the document_id directly into the SQL string for the SELECT part,
        # because SQLAlchemy does not support parameter substitution for identifiers or for type casts in SELECT.
        # This is safe here because document_id is a UUID string from our own DB, not user input.
        # Keep unassigned rows out of district_unions payload/aggregation.
        doc_id_sql = f"'{document_id}'::UUID"
        insert_sql = f"""
            INSERT INTO document.district_unions
                (document_id, zone, geometry, demographic_data, created_at, updated_at)
            WITH geos AS (
                SELECT * FROM get_zone_assignments_geo(:document_id)
            )
            SELECT
                {doc_id_sql} AS document_id,
                zone::INTEGER AS zone,
                ST_Multi(ST_Transform(ST_Union(geos.geometry), 4326)) AS geometry,
                {f"{demographic_json} AS demographic_data" if (gerrydb_table and demographic_json) else "NULL AS demographic_data"},
                NOW() AS created_at,
                NOW() AS updated_at
            FROM geos
            {f"INNER JOIN gerrydb.{gerrydb_table} demo ON demo.path = geos.geo_id" if (gerrydb_table and demographic_json) else ""}
            WHERE zone IS NOT NULL
            GROUP BY zone
            RETURNING
                zone,
                ST_AsGeoJSON(geometry) AS geometry,
                demographic_data,
                updated_at
        """

        # Execute and map the returned rows into DistrictUnions objects
        result = session.execute(
            text(insert_sql),
            {"document_id": document_id},
        )
        rows = result.mappings().all()
        logger.info(f"Result: {rows}")
        # Map the result rows to DistrictUnions objects
        returned_rows: List[DistrictUnionsResponse] = [
            DistrictUnionsResponse.model_validate(row) for row in rows
        ]

        # Compute and insert unassigned row (total from parent_layer minus assigned)
        if parent_layer and demographic_json:
            safe_parent_layer = assert_safe_ident(parent_layer)
            # demo_cols is already validated via assert_safe_ident above
            total_json_pairs = [f"'{col}', SUM({col})" for col in demo_cols]
            total_json = f"json_build_object({', '.join(total_json_pairs)})"
            total_sql = (
                f"SELECT {total_json} AS demographic_data "
                f"FROM gerrydb.{safe_parent_layer}"
            )
            total_result = session.execute(text(total_sql)).mappings().first()

            if total_result and total_result["demographic_data"]:
                total_demo = total_result["demographic_data"]

                # Sum assigned demographics across all zone rows
                assigned_sum: dict = {}
                for row_data in returned_rows:
                    if row_data.demographic_data:
                        for col, val in row_data.demographic_data.items():
                            assigned_sum[col] = assigned_sum.get(col, 0) + val

                # Unassigned = total - assigned. Clamp at 0: for shatterable maps the
                # parent-layer SUM can double-count vs. child-level assignments, which
                # would otherwise surface as a negative "unassigned" bucket.
                unassigned_demo: dict = {}
                for col, val in total_demo.items():
                    unassigned_demo[col] = max(0, val - assigned_sum.get(col, 0))

                # Insert the unassigned row
                unassigned_insert = text("""
                    INSERT INTO document.district_unions
                        (document_id, zone, geometry, demographic_data, created_at, updated_at)
                    VALUES (:document_id, NULL, NULL, :demographic_data, NOW(), NOW())
                    RETURNING
                        zone,
                        ST_AsGeoJSON(geometry) AS geometry,
                        demographic_data,
                        updated_at
                """)
                unassigned_result = (
                    session.execute(
                        unassigned_insert,
                        {
                            "document_id": document_id,
                            "demographic_data": json_mod.dumps(unassigned_demo),
                        },
                    )
                    .mappings()
                    .first()
                )
                if unassigned_result:
                    returned_rows.append(
                        DistrictUnionsResponse.model_validate(unassigned_result)
                    )

        session.commit()
        s3 = settings.get_s3_client()
        if returned_rows and s3:
            # Kick off thumbnail generation (non-blocking)
            background_tasks.add_task(
                generate_thumbnail,
                document_id=document_id,
                out_directory=THUMBNAIL_BUCKET,
            )

        return returned_rows

    except Exception as e:
        logger.error(
            f"Failed to update district unions for document {document_id}: {e}"
        )
        # optional: session.rollback()
        raise
