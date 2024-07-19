import os
import click
import logging
from app.core.config import settings
import subprocess
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@click.group()
def cli():
    pass


@cli.command("import-gerrydb-view")
@click.option("--layer", "-n", help="layer of the view", required=True)
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
def import_gerrydb_view(layer, gpkg: str):
    print("Importing GerryDB view...")

    url = urlparse(gpkg)
    logger.info("URL: %s", url)

    kwargs = {}

    if url.scheme == "s3":
        s3 = settings.get_s3_client()

        if not s3:
            raise ValueError("S3 client is not available")

        file_name = url.path.lstrip("/")
        object_information = s3.head_object(Bucket=url.netloc, Key=file_name)

        if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
            raise ValueError(
                f"GeoPackage file {gpkg} not found in S3 bucket {url.netloc}"
            )

        logger.info("Importing GerryDB view. Got response:\n%s", object_information)

        path = f"/vsis3/{url.netloc}/{file_name}"

        kwargs["env"] = {
            **os.environ,
            "AWS_S3_ENDPOINT": settings.AWS_S3_ENDPOINT,
            "AWS_ACCESS_KEY_ID": settings.AWS_ACCESS_KEY_ID,
            "AWS_SECRET_ACCESS_KEY": settings.AWS_SECRET_ACCESS_KEY,
        }
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
            layer,
        ],
        **kwargs,
    )

    if result.returncode != 0:
        logger.error("ogr2ogr failed. Got %s", result)
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

    logger.info("GerryDB view imported successfully")


if __name__ == "__main__":
    cli()
