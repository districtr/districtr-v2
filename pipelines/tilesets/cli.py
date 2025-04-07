import duckdb

import os
import click
import logging
from urllib.parse import urlparse
from subprocess import run
from typing import Iterable
from files import download_and_unzip_zipfile, exists_in_s3
from settings import settings
from models import GerryDBTileset, TilesetBatch
from utils import merge_tilesets
from constants import (
    DEFAULT_GERRYDB_COLUMNS,
    S3_BASEMAPS_PREFIX,
    S3_TIGER_PREFIX,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.group()
def cli():
    pass


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
@click.option(
    "--new-layer-name",
    "-nln",
    help="Name of the new layer in the GeoPackage file",
    required=False,
)
@click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
@click.option(
    "--column",
    "-c",
    help="Column to include in tileset",
    multiple=True,
    default=DEFAULT_GERRYDB_COLUMNS,
)
def create_gerrydb_tileset(
    layer: str,
    gpkg: str,
    new_layer_name: str | None,
    replace: bool,
    column: Iterable[str],
) -> None:
    """
    Create a tileset from a GeoPackage file. Does not upload the tileset to S3. Use the s3 cli for that.
    """
    if new_layer_name is None:
        new_layer_name = layer

    tileset = GerryDBTileset(
        layer_name=layer, new_layer_name=new_layer_name, gpkg=gpkg, columns=column
    )
    tileset_path = tileset.generate_tiles(replace=replace)

    logger.info(f"Tileset created at {tileset_path}")


@cli.command("merge-gerrydb-tilesets")
@click.option("--out-name", "-o", help="Name of the output tileset", required=True)
@click.option(
    "--parent-layer",
    help="Path to the parent layer to load. Can be an S3 URI",
    required=True,
)
@click.option(
    "--child-layer",
    help="Path to the child layer to load. Can be an S3 URI",
    required=True,
)
@click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
def merge_gerrydb_tilesets(
    out_name: str, parent_layer: str, child_layer: str, replace: bool
) -> None:
    """
    Merge two tilesets. Does not upload the tileset to S3. Use the s3 cli for that.
    """
    merge_tilesets(
        parent_layer=parent_layer,
        child_layer=child_layer,
        out_name=out_name,
        replace=replace,
    )


@cli.command("batch-create-tilesets")
@click.option("--config-path", help="Path to the config file", required=True)
@click.option(
    "--data-dir",
    "-d",
    help="Path to data directory where the geopackages are located or will be downloaded to",
    required=False,
    default=None,
)
@click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
@click.option("--upload", "-u", help="Upload tileset results to S3", is_flag=True)
def batch_create_tilesets(
    config_path: str, data_dir: str | None, replace: bool, upload: bool
) -> None:
    """
    Batch create tilesets from a config file. Does not upload the tileset to S3. Use the s3 cli for that.
    """
    if not os.path.exists(settings.OUT_SCRATCH):
        os.makedirs(settings.OUT_SCRATCH)

    tileset_batch = TilesetBatch.from_file(file_path=config_path)
    tileset_batch.create_all(replace=replace, data_dir=data_dir)

    if upload:
        tileset_batch.upload_results()


@cli.command("create-census-tiles")
@click.option("--replace", is_flag=True, help="Replace existing files", default=False)
@click.option(
    "--data-url",
    type=str,
    help="File path to zipped shapefile from the US Census",
    default=False,
)
@click.option("--upload", is_flag=True, help="Upload files to S3", default=False)
@click.option(
    "--geoid-col", type=str, help="Column name for the GEOID", default="GEOID"
)
@click.option("--name-col", type=str, help="Column name for the NAME", default="NAME")
def create_census_tiles(
    replace: bool = False,
    upload: bool = False,
    data_url=None,
    geoid_col: str = "GEOID",
    name_col: str = "NAME",
) -> None:
    logger.info("Creating census tiles")

    if data_url is None:
        raise ValueError("data_url must be provided")

    file_name = urlparse(data_url).path.split("/")[-1].split(".")[0]

    if replace or not os.path.exists(settings.OUT_SCRATCH / f"{file_name}.zip"):
        logger.info(f"Downloading census shapefile from {data_url}")
        download_and_unzip_zipfile(data_url, settings.OUT_SCRATCH)

    logger.info("Creating census FGB")
    fgb = settings.OUT_SCRATCH / f"{file_name}.fgb"

    if replace or not fgb.exists():
        run(
            [
                "ogr2ogr",
                "-f",
                "FlatGeobuf",
                "-t_srs",
                "EPSG:4326",
                "-nlt",
                "PROMOTE_TO_MULTI",
                fgb,
                settings.OUT_SCRATCH / f"{file_name}.shp",
                file_name,
            ],
            check=True,
        )

    key = f"{S3_BASEMAPS_PREFIX}/{S3_TIGER_PREFIX}/{file_name}.fgb"

    logger.info("Creating census tiles")
    tiles = settings.OUT_SCRATCH / f"{file_name}.pmtiles"
    if replace or not tiles.exists():
        run(
            [
                "tippecanoe",
                "-z12",  # max zoom 12
                "-Z2",  # min zoom 2
                "-pS",  # at zoom 12, NO simplification
                "--drop-densest-as-needed",
                "--extend-zooms-if-still-dropping",
                "-o",
                tiles,
                "-l",
                file_name,
                fgb,
                "--force",
            ],
            check=True,
        )

    logger.info("Creating census label centroids")
    label_fgb = settings.OUT_SCRATCH / f"{file_name}_label.fgb"
    if replace or not label_fgb.exists():
        duckdb.execute(
            f"""
            INSTALL SPATIAL; LOAD spatial;
            COPY (
                SELECT
                    {geoid_col},
                    {name_col},
                    ST_Centroid(geom) as geometry,
                FROM st_read('{fgb}')
            ) TO '{label_fgb}'
            WITH (FORMAT GDAL, DRIVER 'FlatGeobuf', SRS 'EPSG:4326')
            """
        )

    logger.info("Creating label tiles")
    label_tiles = settings.OUT_SCRATCH / f"{file_name}_label.pmtiles"
    if replace or not label_tiles.exists():
        run(
            [
                "tippecanoe",
                "-z10",
                "-Z6",
                "-r1",
                "--cluster-distance=10",
                "-o",
                label_tiles,
                "-l",
                file_name + "_label",
                label_fgb,
                "--force",
            ],
            check=True,
        )

    logger.info("Combining tiles")
    combined_tiles = settings.OUT_SCRATCH / f"{file_name}_full.pmtiles"
    run(
        [
            "tile-join",
            "--force",
            "-o",
            combined_tiles,
            tiles,
            label_tiles,
        ]
    )

    s3_client = settings.get_s3_client()

    key = f"{S3_BASEMAPS_PREFIX}/{S3_TIGER_PREFIX}/{file_name}_full.pmtiles"
    if upload or not exists_in_s3(s3_client, settings.S3_BUCKET, key):
        logger.info("Uploading combined tiles to S3")
        assert s3_client is not None, "S3 client is not initialized"
        s3_client.upload_file(combined_tiles, settings.S3_BUCKET, key)


if __name__ == "__main__":
    cli()
