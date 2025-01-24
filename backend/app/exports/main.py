from psycopg.sql import SQL, Composed, Identifier, Literal
from typing import Callable, Any
from app.exports.models import (
    DocumentExportFormat,
    DocumentExportType,
)


def get_export_sql_method(
    format: DocumentExportFormat,
) -> Callable[..., tuple[Composed, list[Any]]]:
    if format == DocumentExportFormat.geojson:
        return get_geojson_export_sql
    elif format == DocumentExportFormat.csv:
        return get_csv_export_sql

    raise NotImplementedError(f"'{format}' export format is not yet supported")


def get_csv_export_sql(
    export_type: DocumentExportType, **kwargs
) -> tuple[Composed, list[Any]]:
    stmt = None
    params = []

    if export_type == DocumentExportType.zone_assignments:
        stmt = """SELECT
            geo_id,
            zone::TEXT AS zone
        FROM document.assignments
        WHERE document_id = %s
        ORDER BY geo_id"""
        params += [kwargs["document_id"]]

    if stmt is None:
        raise NotImplementedError("Document export type is not yet supported")

    sql = SQL("COPY ( {} ) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER ',')").format(
        SQL(stmt)  # pyright: ignore
    )

    return sql, params


def get_geojson_export_sql(
    export_type: DocumentExportType, **kwargs
) -> tuple[Composed, list[Any]]:
    stmt, geom_type, _id = None, None, None
    params = []

    if export_type == DocumentExportType.zone_assignments:
        stmt = "SELECT * FROM get_zone_assignments_geo(%s::UUID)"
        params += [kwargs["document_id"]]
        geom_type = "Polygon"
        _id = "geo_id"

    elif export_type == DocumentExportType.districts:
        stmt = """WITH geos AS ( SELECT * FROM get_zone_assignments_geo(%s::UUID) )
        SELECT
            zone::TEXT AS zone,
            ST_Union(geometry) AS geometry
        FROM geos
        GROUP BY zone
        """
        params += [kwargs["document_id"]]
        geom_type = "Polygon"
        _id = "zone"

    if not all({stmt, geom_type, _id}):
        raise NotImplementedError("Survey export type is not yet supported")

    sql = SQL("""COPY (
        SELECT jsonb_build_object(
            'type',     'FeatureCollection',
            'features', jsonb_agg(features.feature) )
        FROM (
          SELECT jsonb_build_object(
            'type',       'Feature',
            'id',         {id},
            'geometry',   ST_AsGeoJSON(geometry)::jsonb,
            'properties', to_jsonb(inputs) - 'geometry' - {id_name}
          ) AS feature
          FROM ( {select} ) inputs ) features )
        TO STDOUT""").format(
        id=Identifier("inputs", _id),  # pyright: ignore
        id_name=Literal(_id),
        select=SQL(stmt),  # pyright: ignore
    )

    return sql, params
