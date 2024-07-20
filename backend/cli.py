import os
import click
import logging
from app.main import get_session
from app.core.config import settings
import subprocess
from urllib.parse import urlparse
from sqlalchemy import text
from uuid import uuid4
# from fastapi import Depends

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


GERRY_DB_SCHEMA = "gerrydb"


@click.group()
def cli():
    pass


@cli.command("import-gerrydb-view")
@click.option("--layer", "-n", help="layer of the view", required=True)
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
@click.option("--replace", "-f", help="Replace the file if it exists", is_flag=True)
@click.option("--rm", "-r", help="Delete file after loading to postgres", is_flag=True)
def import_gerrydb_view(layer: str, gpkg: str, replace: bool, rm: bool):
    if layer == "":
        raise ValueError("Layer name is required")

    print("Importing GerryDB view...")

    url = urlparse(gpkg)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()

        if not s3:
            raise ValueError("S3 client is not available")

        file_name = url.path.lstrip("/")
        logger.info("File name: %s", file_name)
        object_information = s3.head_object(Bucket=url.netloc, Key=file_name)

        if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
            raise ValueError(
                f"GeoPackage file {gpkg} not found in S3 bucket {url.netloc}"
            )

        logger.info("Importing GerryDB view. Got response:\n%s", object_information)

        # Download to settings.VOLUME_PATH
        path = os.path.join(settings.VOLUME_PATH, file_name)

        if os.path.exists(path) and not replace:
            logger.info("File already exists. Skipping download.")
        else:
            logger.info("Downloading file...")
            s3.download_file(url.netloc, file_name, path)
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

    print("GerryDB view imported successfully")

    _session = get_session()
    session = next(_session)

    uuid = str(uuid4())

    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (:uuid, :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)

    try:
        session.execute(
            upsert_query,
            {
                "uuid": uuid,
                "name": layer,
            },
        )
        session.commit()
        logger.info("GerryDB view upserted successfully.")
    except Exception as e:
        session.rollback()
        logger.error("Failed to upsert GerryDB view. Got %s", e)
        raise ValueError(f"Failed to upsert GerryDB view. Got {e}")


if __name__ == "__main__":
    cli()
