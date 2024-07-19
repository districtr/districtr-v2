import click
import logging
from app.core.config import settings
# import subprocess
# from pathlib import Path
# from urllib.parse import urlparse

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@click.group()
def cli():
    pass


@cli.command("import-gerrydb-view")
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file")
def import_gerrydb_view(gpkg: str):
    print("Importing GerryDB view...")
    s3 = settings.get_s3_client()

    if not s3:
        raise ValueError("S3 client is not available")

    object_information = s3.head_object(Bucket=settings.R2_BUCKET_NAME, Key=gpkg)

    if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
        raise ValueError(
            f"GeoPackage file {gpkg} not found in S3 bucket {settings.R2_BUCKET_NAME}"
        )

    logger.info("Importing GerryDB view. Got response:\n%s", object_information)


if __name__ == "__main__":
    cli()
