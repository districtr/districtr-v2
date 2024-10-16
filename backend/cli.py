import os
import click
import logging

from app.main import get_session
from app.core.config import settings
import subprocess
from urllib.parse import urlparse, ParseResult
from sqlalchemy import text
from app.constants import GERRY_DB_SCHEMA
from app.utils import (
    create_districtr_map as _create_districtr_map,
    create_shatterable_gerrydb_view as _create_shatterable_gerrydb_view,
    create_parent_child_edges as _create_parent_child_edges,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@click.group()
def cli():
    pass


def download_file_from_s3(s3, url: ParseResult, replace=False) -> str:
    """
    Download a file from S3 to the local volume path.

    Args:
        s3: S3 client
        url (ParseResult): URL of the file to download
        replace (bool): If True, replace the file if it already exists

    Returns the path to the downloaded file.
    """
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
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nlt",
            "MULTIPOLYGON",
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


@cli.command("create-parent-child-edges")
@click.option("--districtr-map", "-d", help="Districtr map name", required=True)
def create_parent_child_edges(districtr_map: str):
    logger.info("Creating parent-child edges...")

    session = next(get_session())
    stmt = text(
        "SELECT uuid FROM districtrmap WHERE gerrydb_table_name = :districtrmap_name"
    )
    (districtr_map_uuid,) = session.execute(
        stmt, params={"districtrmap_name": districtr_map}
    ).one()
    print(f"Found districtmap uuid: {districtr_map_uuid}")
    _create_parent_child_edges(session=session, districtr_map_uuid=districtr_map_uuid)
    session.commit()
    logger.info("Parent-child relationship upserted successfully.")

    session.close()


@cli.command("delete-parent-child-edges")
@click.option("--districtr-map", "-d", help="Districtr map name", required=True)
def delete_parent_child_edges(districtr_map: str):
    logger.info("Deleting parent-child edges...")

    session = next(get_session())

    delete_query = text("""
        DELETE FROM parentchildedges
        WHERE districtr_map = :districtr_map
    """)
    session.execute(
        delete_query,
        {
            "districtr_map": districtr_map,
        },
    )
    session.commit()
    logger.info("Parent-child relationship upserted successfully.")

    session.close()


@cli.command("create-districtr-map")
@click.option("--name", help="Name of the districtr map", required=True)
@click.option("--parent-layer-name", help="Parent gerrydb layer name", required=True)
@click.option("--child-layer-name", help="Child gerrydb layer name", required=False)
@click.option("--gerrydb-table-name", help="Name of the GerryDB table", required=True)
@click.option("--num-districts", help="Number of districts", required=False)
@click.option("--tiles-s3-path", help="S3 path to the tileset", required=False)
def create_districtr_map(
    name: str,
    parent_layer_name: str,
    child_layer_name: str | None,
    gerrydb_table_name: str,
    num_districts: int | None,
    tiles_s3_path: str | None,
):
    logger.info("Creating districtr map...")
    session = next(get_session())
    districtr_map_uuid = _create_districtr_map(
        session=session,
        name=name,
        parent_layer_name=parent_layer_name,
        child_layer_name=child_layer_name,
        gerrydb_table_name=gerrydb_table_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
    )
    session.commit()
    logger.info(f"Districtr map created successfully {districtr_map_uuid}")


@cli.command("create-shatterable-districtr-view")
@click.option("--parent-layer-name", help="Parent gerrydb layer name", required=True)
@click.option("--child-layer-name", help="Child gerrydb layer name", required=False)
@click.option("--gerrydb-table-name", help="Name of the GerryDB table", required=False)
def create_shatterable_gerrydb_view(
    parent_layer_name: str,
    child_layer_name: str,
    gerrydb_table_name: str,
):
    logger.info("Creating materialized shatterable gerrydb view...")
    session = next(get_session())
    inserted_uuid = _create_shatterable_gerrydb_view(
        session=session,
        parent_layer_name=parent_layer_name,
        child_layer_name=child_layer_name,
        gerrydb_table_name=gerrydb_table_name,
    )
    session.commit()
    logger.info(
        f"Materialized shatterable gerrydb view created successfully {inserted_uuid}"
    )


if __name__ == "__main__":
    cli()
