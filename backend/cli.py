import os
import click
import logging
from app.main import get_session
from app.core.config import settings
import subprocess
from urllib.parse import urlparse, ParseResult
from sqlalchemy import text
from app.constants import GERRY_DB_SCHEMA

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@click.group()
def cli():
    pass


def download_file_from_s3(s3, url: ParseResult, replace=False) -> str:
    if not s3:
        raise ValueError("S3 client is not available")

    file_name = url.path.lstrip("/")
    logger.info("File name: %s", file_name)
    object_information = s3.head_object(Bucket=url.netloc, Key=file_name)

    if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
        raise ValueError(
            f"GeoPackage file {file_name} not found in S3 bucket {url.netloc}"
        )

    logger.info("Downloading GerryDB view. Got response:\n%s", object_information)

    # Download to settings.VOLUME_PATH
    path = os.path.join(settings.VOLUME_PATH, file_name)

    if os.path.exists(path) and not replace:
        logger.info("File already exists. Skipping download.")
    else:
        logger.info("Downloading file...")
        s3.download_file(url.netloc, file_name, path)

    return path


@cli.command("import-gerrydb-view")
@click.option("--layer", "-n", help="layer of the view", required=True)
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
@click.option("--replace", "-f", help="Replace the file if it exists", is_flag=True)
@click.option("--rm", "-r", help="Delete file after loading to postgres", is_flag=True)
def import_gerrydb_view(layer: str, gpkg: str, replace: bool, rm: bool):
    logger.info("Importing GerryDB view...")

    url = urlparse(gpkg)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3, url, replace)
    else:
        path = gpkg

    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            f"PG:host={settings.POSTGRES_SERVER} port={settings.POSTGRES_PORT} dbname={settings.POSTGRES_DB} user={settings.POSTGRES_USER} password={settings.POSTGRES_PASSWORD}",
            path,
            layer,  # must match layer name in gpkg
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )

    if result.returncode != 0:
        logger.error("ogr2ogr failed. Got %s", result)
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

    logger.info("GerryDB view imported successfully")

    if rm:
        os.remove(path)
        logger.info("Deleted file %s", path)

    logger.info("GerryDB view imported successfully")

    _session = get_session()
    session = next(_session)

    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)

    try:
        session.execute(
            upsert_query,
            {
                "name": layer,
            },
        )
        session.commit()
        logger.info("GerryDB view upserted successfully.")
    except Exception as e:
        session.rollback()
        logger.error("Failed to upsert GerryDB view. Got %s", e)
        raise ValueError(f"Failed to upsert GerryDB view. Got {e}")

    session.close()


@cli.command("create-gerrydb-tileset")
@click.option("--layer", "-n", help="layer of the view", required=True)
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
@click.option("--replace", "-f", help="Replace the file if it exists", is_flag=True)
@click.option(
    "--rm", "-r", help="Delete tileset after loading to postgres", is_flag=True
)
def create_gerrydb_tileset(layer: str, gpkg: str, replace: bool, rm: bool) -> None:
    logger.info("Creating GerryDB tileset...")
    s3 = settings.get_s3_client()
    assert s3, "S3 client is not available"

    url = urlparse(gpkg)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        path = download_file_from_s3(s3, url, replace)
    else:
        path = gpkg

    fbg_path = f"{settings.VOLUME_PATH}/{layer}.fgb"
    logger.info("Creating flatgeobuf...")
    if os.path.exists(fbg_path) and not replace:
        logger.info("File already exists. Skipping creation.")
    else:
        result = subprocess.run(
            args=[
                "ogr2ogr",
                "-f",
                "FlatGeobuf",
                "-select",
                "path,total_pop,geography",  # this is failing for some layers where the pop total is total_vap
                "-t_srs",
                "EPSG:4326",
                fbg_path,
                path,
                layer,
            ]
        )

        if result.returncode != 0:
            logger.error("ogr2ogr failed. Got %s", result)
            raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

    logger.info("Creating tileset...")
    tileset_path = f"{settings.VOLUME_PATH}/{layer}.pmtiles"

    if os.path.exists(tileset_path) and not replace:
        logger.info("File already exists. Skipping creation.")
    else:
        args = [
            "tippecanoe",
            "-pf",
            "-pk",
            "-ps",
            "-o",
            tileset_path,
            "-l",
            layer,
            fbg_path,
        ]
        if replace:
            args.append("--force")
        result = subprocess.run(args=args)

        if result.returncode != 0:
            logger.error("tippecanoe failed. Got %s", result)
            raise ValueError(f"tippecanoe failed with return code {result.returncode}")

    logger.info("Uploading to R2")
    s3.put_object(Bucket=settings.R2_BUCKET_NAME, Key="tilesets/")
    s3_path = f"tilesets/{layer}.pmtiles"
    s3.upload_file(
        tileset_path,
        settings.R2_BUCKET_NAME,
        s3_path,
    )

    if rm:
        os.remove(path)
        os.remove(fbg_path)
        os.remove(tileset_path)
        logger.info("Deleted files %s, %s, %s", path, fbg_path, tileset_path)

    logger.info("GerryDB tileset uploaded successfully")

    logger.info("Updating GerryDBTiles")
    _session = get_session()
    session = next(_session)

    upsert_query = text("""
        INSERT INTO gerrydbtiles (uuid, name, s3_path, updated_at)
        VALUES (gen_random_uuid(), :name, :s3_path, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
        RETURNING uuid
    """)

    try:
        result = session.execute(
            upsert_query,
            {
                "name": layer,
                "s3_path": s3_path,
            },
        )
        session.commit()
        logger.info("GerryDB tileset upserted successfully:\n%s", result.fetchone())
    except Exception as e:
        session.rollback()
        logger.error("Failed to upsert GerryDB tiles. Got %s", e)
        raise ValueError(f"Failed to upsert GerryDB tiles. Got {e}")

    session.close()


if __name__ == "__main__":
    cli()
