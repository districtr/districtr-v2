import geopandas
import io
import logging
import math
import matplotlib.pyplot as plt
from sqlalchemy import text
from sqlmodel import Session
from app.core.config import settings

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

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


def thumbnail_exists(document_id: str) -> bool:
    """
    Check whether a thumbnail exists yet for this map document.

    Args:
        document_id: The ID for the map

    Returns:
        A true/false response if S3 returns head info.
    """
    s3 = settings.get_s3_client()
    assert s3, "S3 client is not available"
    object_information = s3.head_object(
        Bucket=THUMBNAIL_BUCKET, Key=f"thumbnails/{document_id}.png",
    )
    return object_information["ResponseMetadata"]["HTTPStatusCode"] == 200


def generate_thumbnail(session: Session, document_id: str) -> None:
    """
    Generate a preview image of the map using GeoPandas.

    Args:
        session: The database session.
        document_id: The ID for the map
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
            return color_scheme[int(row["zone"]) % len(color_scheme)]

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

    try:
        conn = session.get_bind().raw_connection()
        df = geopandas.read_postgis(sql, conn).to_crs(epsg=3857)
        df["color"] = df.apply(lambda row: coloration(row), axis=1)

        geoplt = df.plot(figsize=(2.8, 2.8), color=df["color"])
        geoplt.set_axis_off()
        pic_IObytes = io.BytesIO()
        geoplt.figure.savefig(pic_IObytes, format="png")
        plt.close(geoplt.figure)
        pic_IObytes.seek(0)
    except:
        logger.error(f"Could not generate thumbnail for {document_id}")
        return

    # write to S3
    try:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3.put_object(
            Bucket=THUMBNAIL_BUCKET,
            Key=f"thumbnails/{document_id}.png",
            Body=pic_IObytes,
            ContentType="image/png",
        )
    except:
        logger.error(f"Could not upload thumbnail for {document_id}")
