import csv
import json
import logging
import geopandas as gpd
import shapely
import tempfile
import zipfile
import os
from app.core.io import remove_file
from datetime import datetime, UTC
from typing import Annotated
from fastapi import APIRouter, status, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, select, col
from app.core.dependencies import get_protected_document
from app.core.db import get_session
from app.models import Document, DistrictrMap, DistrictUnionsResponse, Assignments
from app.exports.models import DocumentExportType
from app.utils import update_or_select_district_stats
from app.evaluation.graph import get_graph
from app.evaluation.main import update_or_select_document_evaluation


router = APIRouter(tags=["exports"])
logger = logging.getLogger(__name__)


def build_block_assignments_csv(
    document_id: str, session: Session, out_file: str
) -> None:
    """Write a CSV of assignments for the given document to out_file."""
    doc_row = session.exec(
        select(
            DistrictrMap.gerrydb_table_name,
            DistrictrMap.child_layer,
        )
        .join(Document)
        .where(Document.document_id == document_id)
    ).first()
    if doc_row is None:
        raise ValueError(f"No map found for document_id: {document_id}")
    gerrydb_table_name, child_layer = doc_row

    rows = session.exec(
        select(Assignments.geo_id, Assignments.zone)
        .where(col(Assignments.document_id) == document_id)
        .where(col(Assignments.zone).is_not(None))
    ).all()

    if child_layer is None:
        with open(out_file, "w", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(["geo_id", "zone"])
            writer.writerows(rows)
        return

    G = get_graph(gerrydb_table_name)
    with open(out_file, "w", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["geo_id", "zone"])
        for geo_id, zone in rows:
            if "children" in G.nodes[geo_id]:
                for child in G.nodes[geo_id]["children"]:
                    writer.writerow([child, zone])
            else:
                writer.writerow([geo_id, zone])


def build_evaluation_json(
    document: Document,
    session: Session,
    background_tasks: BackgroundTasks,
    out_file: str,
) -> None:
    envelope = update_or_select_document_evaluation(background_tasks, session, document)
    with open(out_file, "w") as f:
        json.dump(envelope, f)


def build_districts_geojson(
    district_rows: list[DistrictUnionsResponse], out_file: str
) -> None:
    # row.geometry is already a GeoJSON string from ST_AsGeoJSON — embed directly
    # as a raw fragment to avoid a json.loads() + json.dumps() round-trip on large geometries.
    features = ",".join(
        f'{{"type":"Feature","id":"{row.zone}","geometry":{row.geometry},"properties":{{"zone":"{row.zone}"}}}}'
        for row in district_rows
        if row.zone is not None and row.geometry is not None
    )
    with open(out_file, "w") as f:
        f.write(f'{{"type":"FeatureCollection","features":[{features}]}}')


def build_districts_shapefile(
    district_rows: list[DistrictUnionsResponse], out_file: str
) -> None:
    rows = [r for r in district_rows if r.zone is not None and r.geometry is not None]
    zones = [str(r.zone) for r in rows]
    geoms = [shapely.from_geojson(r.geometry) for r in rows]
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
    ext = {
        DocumentExportType.block_assignments_csv: "csv",
        DocumentExportType.districts_geojson: "geojson",
        DocumentExportType.districts_shapefile: "zip",
        DocumentExportType.evaluation_json: "json",
    }[_export_type]
    out_file_name = f"{document_id}_{_export_type.value}_{timestamp}.{ext}"
    _out_file = f"/tmp/{out_file_name}"
    background_tasks.add_task(remove_file, _out_file)

    if _export_type == DocumentExportType.block_assignments_csv:
        try:
            build_block_assignments_csv(str(document.document_id), session, _out_file)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
            )
        return FileResponse(
            path=_out_file, media_type="text/csv; charset=utf-8", filename=out_file_name
        )

    if _export_type == DocumentExportType.evaluation_json:
        build_evaluation_json(document, session, background_tasks, _out_file)
        return FileResponse(
            path=_out_file, media_type="application/json", filename=out_file_name
        )

    # District boundary exports — refresh the district_unions cache then build from results
    district_rows = update_or_select_district_stats(
        session, str(document.document_id), background_tasks
    )
    if not any(r.zone is not None and r.geometry is not None for r in district_rows):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No district boundaries found — assign zones before exporting boundaries",
        )

    if _export_type == DocumentExportType.districts_geojson:
        build_districts_geojson(district_rows, _out_file)
        return FileResponse(
            path=_out_file, media_type="application/json", filename=out_file_name
        )

    # Shapefile exports
    build_districts_shapefile(district_rows, _out_file)
    return FileResponse(
        path=_out_file, media_type="application/zip", filename=out_file_name
    )
