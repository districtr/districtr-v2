import logging
from app.core.io import remove_file
from datetime import datetime, UTC
from typing import Annotated
from fastapi import APIRouter, status, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import Session
from psycopg.sql import SQL, Composed, Identifier, Literal
from psycopg.errors import RaiseException
from typing import Callable, Any
from app.core.dependencies import get_document
from app.core.db import get_session
from app.models import Document
from app.exports.models import (
    DocumentExportFormat,
    DocumentExportType,
)


router = APIRouter(tags=["exports"])
logger = logging.getLogger(__name__)


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

    elif export_type == DocumentExportType.block_zone_assignments:
        stmt = """SELECT * FROM get_block_assignments(%s)"""
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

    elif export_type == DocumentExportType.block_zone_assignments:
        # Sadly, most GeoJSON block exports are too large to go over HTTP
        # as a JSON FileResponse. Need to think through a better method.
        raise NotImplementedError(
            "Block export type is not yet supported for GeoJSON as files are too large"
        )

        # stmt = """SELECT * FROM get_block_assignments_geo(%s)"""
        # params += [kwargs["document_id"]]
        # geom_type = "Polygon"
        # _id = "geo_id"

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


@router.get("/api/document/{document_id}/export", status_code=status.HTTP_200_OK)
async def export_document(
    *,
    document: Annotated[Document, Depends(get_document)],
    background_tasks: BackgroundTasks,
    format: str = "CSV",
    export_type: str = "ZoneAssignments",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10_000, ge=0),
    session: Session = Depends(get_session),
) -> FileResponse:
    try:
        _format = DocumentExportFormat(format)
        _export_type = DocumentExportType(export_type)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    out_file_name = f"{document.document_id}_{_export_type.value}_{timestamp}.{_format.value.lower()}"

    try:
        get_sql = get_export_sql_method(_format)
        sql, params = get_sql(
            _export_type,
            document_id=document.document_id,
            offset=offset,
            limit=limit,
        )
    except NotImplementedError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        )

    conn = session.connection().connection
    _out_file = f"/tmp/{out_file_name}"
    background_tasks.add_task(remove_file, _out_file)

    with conn.cursor().copy(sql, params=params) as copy:
        with open(_out_file, "wb") as f:
            try:
                while data := copy.read():
                    f.write(data)
                f.close()
            except RaiseException as error:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(error),
                )

        media_type = {
            DocumentExportFormat.csv: "text/csv; charset=utf-8",
            DocumentExportFormat.geojson: "application/json",
        }.get(_format, "text/plain; charset=utf-8")
        return FileResponse(
            path=_out_file, media_type=media_type, filename=out_file_name
        )
