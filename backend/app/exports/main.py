import logging
import geopandas as gpd
import shapely
import tempfile
import zipfile
import os
from app.core.io import remove_file
from datetime import datetime, UTC
from typing import Annotated, Any
from fastapi import APIRouter, status, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import Session
from sqlalchemy import text
from psycopg.sql import SQL, Composed, Identifier, Literal
from psycopg.errors import RaiseException
from app.core.dependencies import get_protected_document
from app.core.db import get_session
from app.models import Document
from app.exports.models import DocumentExportType
from app.utils import update_or_select_district_stats


router = APIRouter(tags=["exports"])
logger = logging.getLogger(__name__)


def get_block_assignments_csv_sql(**kwargs) -> tuple[Composed, list[Any]]:
    sql = SQL("COPY ( {} ) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER ',')").format(
        SQL("SELECT * FROM get_block_assignments(%s)")
    )
    return sql, [kwargs["document_id"]]


def get_districts_geojson_sql(**kwargs) -> tuple[Composed, list[Any]]:
    # Reads pre-dissolved geometries from the district_unions cache.
    # Caller must invoke update_or_select_district_stats first to ensure the cache is fresh.
    sql = SQL("""COPY (
        SELECT jsonb_build_object(
            'type',     'FeatureCollection',
            'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb))
        FROM (
          SELECT jsonb_build_object(
            'type',       'Feature',
            'id',         {id},
            'geometry',   ST_AsGeoJSON(geometry)::jsonb,
            'properties', to_jsonb(inputs) - 'geometry' - {id_name}
          ) AS feature
          FROM (
            SELECT zone::TEXT AS zone, geometry
            FROM document.district_unions
            WHERE document_id = %s AND zone IS NOT NULL
            ORDER BY zone
          ) inputs
        ) features
    ) TO STDOUT""").format(
        id=Identifier("inputs", "zone"),
        id_name=Literal("zone"),
    )
    return sql, [kwargs["document_id"]]


def generate_district_shapefile(document_id: str, session: Session, out_file: str) -> None:
    # document_id is a trusted UUID string from document.document_id — safe to interpolate
    result = session.execute(
        text(f"""
        SELECT zone::TEXT AS zone, ST_AsEWKB(geometry) AS geom
        FROM document.district_unions
        WHERE document_id = '{document_id}'::UUID AND zone IS NOT NULL
        ORDER BY zone
        """)
    )
    rows = result.fetchall()

    if not rows:
        raise ValueError(
            "No district boundaries found — assign zones before exporting boundaries"
        )

    zones = [row[0] for row in rows]
    geoms = shapely.from_wkb([bytes(row[1]) for row in rows])

    gdf = gpd.GeoDataFrame({"zone": zones}, geometry=geoms, crs="EPSG:4326")

    with tempfile.TemporaryDirectory() as tmpdir:
        shp_path = os.path.join(tmpdir, "districts.shp")
        gdf.to_file(shp_path, driver="ESRI Shapefile")
        with zipfile.ZipFile(out_file, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in os.listdir(tmpdir):
                zf.write(os.path.join(tmpdir, fname), arcname=fname)


@router.get("/api/document/{document_id}/export", status_code=status.HTTP_200_OK)
async def export_document(
    *,
    document_id: str,
    document: Annotated[Document, Depends(get_protected_document)],
    background_tasks: BackgroundTasks,
    export_type: str = "BlockAssignmentsCSV",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10_000, ge=0),
    session: Session = Depends(get_session),
) -> FileResponse:
    try:
        _export_type = DocumentExportType(export_type)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")

    # District exports read pre-dissolved geometry from the district_unions cache.
    # Refresh the cache before querying so the export reflects the current assignments.
    if _export_type in (DocumentExportType.districts_geojson, DocumentExportType.districts_shapefile):
        update_or_select_district_stats(session, str(document.document_id), background_tasks)

    if _export_type == DocumentExportType.districts_shapefile:
        out_file_name = f"{document_id}_Districts_{timestamp}.zip"
        _out_file = f"/tmp/{out_file_name}"
        background_tasks.add_task(remove_file, _out_file)
        try:
            generate_district_shapefile(str(document.document_id), session, _out_file)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
            )
        return FileResponse(path=_out_file, media_type="application/zip", filename=out_file_name)

    # COPY-based exports (CSV and GeoJSON)
    ext = {
        DocumentExportType.block_assignments_csv: "csv",
        DocumentExportType.districts_geojson: "geojson",
    }[_export_type]
    out_file_name = f"{document_id}_{_export_type.value}_{timestamp}.{ext}"
    _out_file = f"/tmp/{out_file_name}"
    background_tasks.add_task(remove_file, _out_file)

    if _export_type == DocumentExportType.block_assignments_csv:
        sql, params = get_block_assignments_csv_sql(document_id=document.document_id)
    else:
        sql, params = get_districts_geojson_sql(document_id=document.document_id)

    conn = session.connection().connection
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
        DocumentExportType.block_assignments_csv: "text/csv; charset=utf-8",
        DocumentExportType.districts_geojson: "application/json",
    }.get(_export_type, "text/plain; charset=utf-8")
    return FileResponse(path=_out_file, media_type=media_type, filename=out_file_name)
