import os
from typing import Iterable
import click
import logging

from app.main import get_session
from app.core.config import settings
import subprocess
from urllib.parse import urlparse, ParseResult
from sqlalchemy import text
from app.constants import GERRY_DB_SCHEMA
from sqlalchemy import bindparam, Integer, String
from sqlmodel import Session

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


@cli.command("create-parent-child-relationships")
@click.option("--districtr-map", "-d", help="Districtr map UUID", required=True)
@click.option("--parent", "-p", help="Parent layer", required=True)
@click.option("--child", "-c", help="Child layer", required=True)
def create_parent_child_relationships(districtr_map: str, parent: str, child: str):
    logger.info("Creating parent-child relationships...")

    session = next(get_session())

    upsert_query = text("""
        CALL add_parent_child_relationships(
            CAST(:districtr_map AS UUID),
            CAST(:parent AS TEXT),
            CAST(:child AS TEXT)
        )
    """)
    session.execute(
        upsert_query,
        {
            "districtr_map": districtr_map,
            "parent": parent,
            "child": child,
        },
    )
    session.commit()
    logger.info("Parent-child relationship upserted successfully.")

    session.close()


@cli.command("delete-parent-child-relationships")
@click.option("--districtr-map", "-d", help="Districtr map UUID", required=True)
def delete_parent_child_relationships(districtr_map: str):
    logger.info("Deleting parent-child relationships...")

    session = next(get_session())

    delete_query = text("""
        DELETE FROM parent_child_relationships
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


@cli.command("create-gerrydb-tileset")
@click.option(
    "--layer", "-n", help="Name of the layer in the gerrydb view to load", required=True
)
@click.option(
    "--gpkg",
    "-g",
    help="Path or URL to GeoPackage file. If URL, must be s3 URI",
    required=True,
)
@click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
@click.option(
    "--column",
    "-c",
    help="Column to include in tileset",
    multiple=True,
    default=[
        "path",
        "geography",
        "total_pop",
    ],
)
def create_gerrydb_tileset(
    layer: str, gpkg: str, replace: bool, column: Iterable[str]
) -> None:
    """
    Create a tileset from a GeoPackage file. Does not upload the tileset to S3. Use the s3 cli for that.

    Note: this command is intended to be run locally. The server doesn't have the tippecannoe dependency. That's
    intentional for now as we don't want to burden the server with memory intensive tasks.
    """
    logger.info("Creating GerryDB tileset...")
    s3 = settings.get_s3_client()

    url = urlparse(gpkg)
    logger.info("URL: %s", url)

    path = gpkg

    if url.scheme == "s3":
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3, url, replace)

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
                ",".join(column),
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

    args = [
        "tippecanoe",
        "-zg",
        "--coalesce-smallest-as-needed",
        "--extend-zooms-if-still-dropping",
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


def _create_districtr_map(
    session: Session,
    name: str,
    parent_layer_name: str,
    child_layer_name: str | None = None,
    gerrydb_table_name: str | None = None,
    num_districts: int | None = None,
    tiles_s3_path: str | None = None,
):
    stmt = text("""
    SELECT * FROM create_districtr_map(
        :map_name,
        :gerrydb_table_name,
        :num_districts,
        :tiles_s3_path,
        :parent_layer_name,
        :child_layer_name
    )""").bindparams(
        bindparam(key="map_name", type_=String),
        bindparam(key="gerrydb_table_name", type_=String),
        bindparam(key="num_districts", type_=Integer),
        bindparam(key="tiles_s3_path", type_=String),
        bindparam(key="parent_layer_name", type_=String),
        bindparam(key="child_layer_name", type_=String),
    )

    (inserted_uuid,) = session.execute(
        stmt,
        {
            "map_name": name,
            "gerrydb_table_name": gerrydb_table_name,
            "num_districts": num_districts,
            "tiles_s3_path": tiles_s3_path,
            "parent_layer_name": parent_layer_name,
            "child_layer_name": child_layer_name,
        },
    )
    return inserted_uuid


@cli.command("create-districtr-map")
@click.option("--name", help="Name of the districtr map", required=True)
@click.option("--parent-layer-name", help="Parent gerrydb layer name", required=True)
@click.option("--child-layer-name", help="Child gerrydb layer name", required=False)
@click.option("--gerrydb-table-name", help="Name of the GerryDB table", required=False)
@click.option("--num-districts", help="Number of districts", required=False)
@click.option("--tiles-s3-path", help="S3 path to the tileset", required=False)
def create_districtr_map(
    name: str,
    parent_layer_name: str,
    child_layer_name: str,
    gerrydb_table_name: str,
    num_districts: int,
    tiles_s3_path: str,
):
    logger.info("Creating districtr map...")
    session = next(get_session())
    inserted_uuid = _create_districtr_map(
        session=session,
        name=name,
        parent_layer_name=parent_layer_name,
        child_layer_name=child_layer_name,
        gerrydb_table_name=gerrydb_table_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
    )
    session.commit()
    logger.info(f"Districtr map created successfully {inserted_uuid}")


if __name__ == "__main__":
    cli()
