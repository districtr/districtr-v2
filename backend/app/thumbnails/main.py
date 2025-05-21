import geopandas
from typing import Annotated
import io
import logging
import math
import matplotlib.pyplot as plt
import random
from sqlalchemy import text
from sqlmodel import Session
from app.core.config import settings
from fastapi import APIRouter, Security, status, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from app.core.security import auth, TokenScope
from app.core.db import get_session
from app.core.dependencies import get_document
from app.models import Document
from urllib.parse import urlparse
from pathlib import Path
from boto3.exceptions import S3UploadFailedError
from app.core.io import file_exists, UnsupportedFileScheme

router = APIRouter(tags=["thumbnails"])
logger = logging.getLogger(__name__)

THUMBNAIL_BUCKET = settings.R2_BUCKET_NAME

DISTRICT_COLORS = [
    "#0099cd",
    "#ffca5d",
    "#00cd99",
    "#99cd00",
    "#cd0099",
    "#9900cd",
    "#8dd3c7",
    "#bebada",
    "#fb8072",
    "#80b1d3",
    "#fdb462",
    "#b3de69",
    "#fccde5",
    "#bc80bd",
    "#ccebc5",
    "#ffed6f",
    "#ffffb3",
    "#a6cee3",
    "#1f78b4",
    "#b2df8a",
    "#33a02c",
    "#fb9a99",
    "#e31a1c",
    "#fdbf6f",
    "#ff7f00",
    "#cab2d6",
    "#6a3d9a",
    "#b15928",
    "#64ffda",
    "#00B8D4",
    "#A1887F",
    "#76FF03",
    "#DCE775",
    "#B388FF",
    "#FF80AB",
    "#D81B60",
    "#26A69A",
    "#FFEA00",
    "#6200EA",
]


def get_document_thumbnail_file_path(document_id: str) -> str:
    return f"s3://{THUMBNAIL_BUCKET}/thumbnails/{document_id}.png"


def write_image(out_path: str | Path, pic_IObytes: io.BytesIO) -> None:
    logger.info(f"Writing image to {out_path}.")
    url = urlparse(url=str(out_path))

    if url.scheme == "s3":
        logger.info("Saving to S3")
        bucket = url.netloc
        logger.info(f"s3 bucket: `{bucket}`")
        key = url.path.lstrip("/")
        logger.info(f"s3 key: `{key}`")
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"

        response = s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=pic_IObytes,
            ContentType="image/png",
        )
        logger.info(response)

    elif url.scheme == "":
        logger.info("Saving to file")
        with open(url.path, "wb") as f:
            f.write(pic_IObytes.read())

    else:
        raise UnsupportedFileScheme(f"Cannot write to {out_path}")


def generate_thumbnail(
    session: Session, document_id: str, out_directory: str | None
) -> str:
    """
    Generate a preview image of the map using GeoPandas.

    Args:
        session: The database session.
        document_id: The ID for the map
        out_directory: Directory to which the thumbnail should be written.

    Returns:
        Path to thumbnail file.
    """
    stmt = text("""
        SELECT color_scheme, parent_layer, child_layer
        FROM document.document doc
        JOIN districtrmap ON districtrmap.districtr_map_slug = doc.districtr_map_slug
        WHERE document_id = :document_id
    """)
    results = session.execute(stmt, {"document_id": document_id})
    color_scheme, parent_layer, child_layer = results.one()

    if color_scheme is None or len(color_scheme) == 0:
        color_scheme = DISTRICT_COLORS

    def coloration(row):
        if row["zone"] is None or math.isnan(row["zone"]):
            return "#CCCCCC"
        else:
            return color_scheme[int(row["zone"]) - 1 % len(color_scheme)]

    sql = f"""
    SELECT ST_Collect(geometry) AS geom, zone
    FROM gerrydb.{parent_layer} geos
    LEFT JOIN "document.assignments_{document_id}" assigned ON geos.path = assigned.geo_id
    GROUP BY zone
    """
    if child_layer is not None:
        sql += f"""UNION
        (SELECT ST_Collect(geometry) AS geom, zone
        FROM "document.assignments_{document_id}" assigned
        INNER JOIN gerrydb.{child_layer} blocks ON blocks.path = assigned.geo_id
        WHERE zone IS NOT NULL
        GROUP BY zone)"""

    conn = session.connection().connection
    gdf = geopandas.read_postgis(sql=sql, con=conn).to_crs(epsg=3857)  # pyright: ignore
    gdf["color"] = gdf.apply(lambda row: coloration(row), axis=1)

    geoplt = gdf.plot(figsize=(2.8, 2.8), color=gdf["color"])
    geoplt.set_axis_off()
    pic_IObytes = io.BytesIO()
    geoplt.figure.savefig(pic_IObytes, format="png")
    plt.close(geoplt.figure)
    pic_IObytes.seek(0)

    out_file = get_document_thumbnail_file_path(document_id)
    try:
        write_image(out_file, pic_IObytes)
    except (ValueError, S3UploadFailedError) as e:
        logger.error(f"Could not upload thumbnail for {document_id}")
        raise e
    finally:
        pic_IObytes.close()
        logger.info(f"Thumbnail uploaded for {document_id}")

    return out_file


@router.get("/api/document/{document_id}/thumbnail", status_code=status.HTTP_200_OK)
async def get_thumbnail(*, document_id: str, session: Session = Depends(get_session)):
    thumbail_file_path = get_document_thumbnail_file_path(document_id)
    if file_exists(thumbail_file_path):
        return RedirectResponse(url=f"{settings.cnd_url}/thumbnails/{document_id}.png")

    return RedirectResponse(url="/home-megaphone.png")


@router.post("/api/document/{document_id}/thumbnail", status_code=status.HTTP_200_OK)
async def make_thumbnail(
    *,
    document: Annotated[Document, Depends(get_document)],
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
):
    if document.document_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    background_tasks.add_task(
        generate_thumbnail,
        session=session,
        document_id=document.document_id,
        out_directory=THUMBNAIL_BUCKET,
    )
    return {"message": "Generating thumbnail in background task"}


def generate_blank(
    session: Session, districtr_map_slug: str, out_directory: str | None
) -> str:
    """
    Generate a preview image of a blank DistrictrMap using GeoPandas.

    Args:
        session: The database session.
        districtr_map_slug: The ID for the base map
        out_directory: Directory to which the thumbnail should be written.

    Returns:
        Path to thumbnail file.
    """
    stmt = text("""
        SELECT parent_layer
        FROM districtrmap
        WHERE districtr_map_slug = :districtr_map_slug
    """)
    results = session.execute(stmt, {"districtr_map_slug": districtr_map_slug})
    [parent_layer] = results.one()

    sql = f"""
    SELECT geometry AS geom
    FROM gerrydb.{parent_layer}
    """

    conn = session.connection().connection
    gdf = geopandas.read_postgis(sql=sql, con=conn).to_crs(epsg=3857)  # pyright: ignore

    # faint background coloring
    bg_colors = [
        (0.8, 0.8, 0.8, 0.4),  # light gray
        (0.7, 0.7, 1.0, 0.4),  # light blue
        (0.75, 1.0, 0.75, 0.4),  # light green
        (0.75, 0.85, 1.0, 0.4),  # lavender
    ]
    bg_color = random.choice(bg_colors)

    _, ax = plt.subplots(figsize=(5.6, 5.6), facecolor=bg_color)
    geoplt = gdf.plot(
        ax=ax, figsize=(5.6, 5.6), color="#fbeeac", linewidth=0.5, edgecolor="#444444"
    )
    geoplt.set_axis_off()
    pic_IObytes = io.BytesIO()
    geoplt.figure.savefig(pic_IObytes, format="png")
    plt.close(geoplt.figure)
    pic_IObytes.seek(0)

    out_file = get_document_thumbnail_file_path(districtr_map_slug)
    try:
        write_image(out_file, pic_IObytes)
    except (ValueError, S3UploadFailedError) as e:
        logger.error(f"Could not upload blank map thumbnail for {districtr_map_slug}")
        raise e
    finally:
        pic_IObytes.close()
        logger.info(f"Thumbnail uploaded for {districtr_map_slug}")

    return out_file


@router.post(
    "/api/gerrydb/{districtr_map_slug}/thumbnail", status_code=status.HTTP_200_OK
)
async def make_districtrmap_thumbnail(
    *,
    districtr_map_slug: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.create_content]),
):
    background_tasks.add_task(
        generate_blank,
        session=session,
        districtr_map_slug=districtr_map_slug,
        out_directory=THUMBNAIL_BUCKET,
    )
    return {"message": "Generating blank map thumbnail in background task"}
