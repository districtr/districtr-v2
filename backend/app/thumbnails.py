import geopandas
import io
import logging
import math
import matplotlib.pyplot as plt
from sqlalchemy import text
from sqlmodel import Session
from app.core.config import settings, Environment

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


# receives the document_id and returns whether a thumbnail exists on S3
def thumbnail_exists(document_id: str) -> bool:
    s3 = settings.get_s3_client()
    assert s3, "S3 client is not available"
    object_information = s3.head_object(Bucket=f"s3://{THUMBNAIL_BUCKET}/thumbnails", Key=document_id)
    return object_information["ResponseMetadata"]["HTTPStatusCode"] == 200


# receives the current session and requested document_id
# returns io stream of generated image
def generate_thumbnail(session: Session, document_id: str) -> io.BytesIO:
    stmt = text(
        "SELECT gerrydb_table, color_scheme FROM document.document WHERE document_id = :document_id"
    )
    results = session.execute(stmt, {"document_id": document_id})
    gerrydb_table, color_scheme = results.one()

    if color_scheme is None or len(color_scheme) == 0:
        color_scheme = DISTRICT_COLORS
    def coloration(row):
        if (row['zone'] is None or math.isnan(row['zone'])):
            return "#CCCCCC"
        else:
            return color_scheme[int(row['zone']) % len(color_scheme)]

    sql = f"""SELECT ST_Union(geometry) AS geom, zone
    FROM gerrydb.{gerrydb_table} geos
    LEFT JOIN "document.assignments_{document_id}" assigned ON geos.path = assigned.geo_id
    GROUP BY zone
    """
    conn = conn = session.connection().connection
    df = geopandas.read_postgis(sql, conn).to_crs(epsg=3857)

    df['color'] = df.apply(lambda row: coloration(row), axis=1)
    geoplt = df.plot(figsize=(2.8, 2.8), color=df['color'])
    geoplt.set_axis_off()
    pic_IObytes = io.BytesIO()
    geoplt.figure.savefig(pic_IObytes, format='png')
    plt.close(geoplt.figure)
    pic_IObytes.seek(0)

    # write to S3
    try:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3.put_object(
            Bucket=THUMBNAIL_BUCKET,
            Key=f"thumbnails/{document_id}",
            Body=pic_IObytes,
            ContentType="image/png"
        )
    except:
        logger.info("Could not upload thumbnail")

    return pic_IObytes


# fetch current thumbnail or generate one
def fetch_thumbnail(session: Session, document_id: str) -> io.BytesIO:
    if thumbnail_exists(document_id):
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3_object = s3.get_object(Bucket=THUMBNAIL_BUCKET, Key=document_id)
        return s3_object["Body"]
    else:
        return generate_thumbnail(session, document_id)
