import geopandas as gpd
import pandas as pd
import duckdb

import os
import click
import logging
from urllib.request import urlretrieve
from urllib.parse import urlparse
from subprocess import run
from typing import Iterable
import json
from files import download_and_unzip_zipfile, exists_in_s3, download_file_from_s3
from settings import settings

TIGER_YEAR = 2023
WISCONSIN_TABBLOCK20 = f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/TABBLOCK20/tl_{TIGER_YEAR}_55_tabblock20.zip"
BLOCK_COLS = ["GEOID20", "ALAND20", "POP20", "HOUSING20", "geometry"]

S3_PREFIX = "basemaps"

TIGER_COUNTY_URL = f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/COUNTY/tl_{TIGER_YEAR}_us_county.zip"
S3_TIGER_PREFIX = f"tiger/tiger{TIGER_YEAR}"


logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)


@click.group()
def cli():
    pass


@cli.command()
@click.option("--replace", is_flag=True, help="Replace existing files", default=False)
@click.option("--upload", is_flag=True, help="Upload files to S3", default=False)
def create_county_tiles(replace: bool = False, upload: bool = False):
    LOGGER.info("Creating county tiles")
    if replace or not os.path.exists(
        settings.OUT_SCRATCH / "tl_{TIGER_YEAR}_us_county.zip"
    ):
        LOGGER.info(f"Downloading county shapefile from {TIGER_COUNTY_URL}")
        download_and_unzip_zipfile(TIGER_COUNTY_URL, settings.OUT_SCRATCH)

    LOGGER.info("Creating county FGB")
    file_name = urlparse(TIGER_COUNTY_URL).path.split("/")[-1].split(".")[0]
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

    key = f"{S3_PREFIX}/{S3_TIGER_PREFIX}/{file_name}.fgb"

    LOGGER.info("Creating county tiles")
    tiles = settings.OUT_SCRATCH / f"{file_name}.pmtiles"
    if replace or not tiles.exists():
        run(
            [
                "tippecanoe",
                "-zg",
                "-Z6",
                "--coalesce-densest-as-needed",
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

    LOGGER.info("Creating county label centroids")
    label_fgb = settings.OUT_SCRATCH / f"{file_name}_label.fgb"
    if replace or not label_fgb.exists():
        duckdb.execute(
            f"""
            INSTALL SPATIAL; LOAD spatial;
            COPY (
                SELECT
                    GEOID,
                    NAME,
                    ST_Centroid(geom) as geometry,
                FROM st_read('{fgb}')
            ) TO '{label_fgb}'
            WITH (FORMAT GDAL, DRIVER 'FlatGeobuf', SRS 'EPSG:4326')
            """
        )

    LOGGER.info("Creating county label tiles")
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

    LOGGER.info("Combining tiles")
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

    key = f"{S3_PREFIX}/{S3_TIGER_PREFIX}/{file_name}_full.pmtiles"
    if upload or not exists_in_s3(s3_client, settings.S3_BUCKET, key):
        LOGGER.info("Uploading combined tiles to S3")
        s3_client.upload_file(combined_tiles, settings.S3_BUCKET, key)


@click.command()
def wi_blocks():
    if not os.path.exists(f"{settings.OUT_SCRATCH}/tl_{TIGER_YEAR}_55_tabblock20.zip"):
        download_and_unzip_zipfile(WISCONSIN_TABBLOCK20, settings.OUT_SCRATCH)

    gdf = gpd.read_file(f"{settings.OUT_SCRATCH}/tl_{TIGER_YEAR}_55_tabblock20.shp")[
        BLOCK_COLS
    ].copy()

    print(gdf.info())

    for col in BLOCK_COLS:
        if col not in ["GEOID20", "geometry"]:
            gdf[col] = pd.to_numeric(gdf[col], downcast="unsigned")

    invalid_geom_indices = gdf.index[~gdf.geometry.is_valid]
    gdf.drop(invalid_geom_indices, inplace=True)

    print(gdf.info())

    gdf.to_parquet(
        f"{settings.OUT_SCRATCH}/tl_{TIGER_YEAR}_55_tabblock20.parquet",
        compression="brotli",
        row_group_size=len(gdf),
        index=False,
    )


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
    """
    LOGGER.info("Creating GerryDB tileset...")
    s3 = settings.get_s3_client()

    url = urlparse(gpkg)
    LOGGER.info("URL: %s", url)

    path = gpkg

    if url.scheme == "s3":
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3, url, replace)

    fbg_path = f"{settings.OUT_SCRATCH}/{layer}.fgb"
    LOGGER.info("Creating flatgeobuf...")
    if os.path.exists(fbg_path) and not replace:
        LOGGER.info("File already exists. Skipping creation.")
    else:
        result = run(
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
            LOGGER.error("ogr2ogr failed. Got %s", result)
            raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

    LOGGER.info("Creating tileset...")
    tileset_path = f"{settings.OUT_SCRATCH}/{layer}.pmtiles"

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

    result = run(args=args)

    if result.returncode != 0:
        LOGGER.error("tippecanoe failed. Got %s", result)
        raise ValueError(f"tippecanoe failed with return code {result.returncode}")


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
    LOGGER.info("Merging GerryDB tilesets...")

    s3 = settings.get_s3_client()

    parent_url = urlparse(parent_layer)
    LOGGER.info("Parent URL: %s", parent_url)

    parent_path = parent_layer

    if parent_url.scheme == "s3":
        assert s3, "S3 client is not available"
        parent_path = download_file_from_s3(s3, parent_url, replace)

    child_url = urlparse(child_layer)
    LOGGER.info("Child URL: %s", child_url)

    child_path = child_layer

    if child_url.scheme == "s3":
        assert s3, "S3 client is not available"
        child_path = download_file_from_s3(s3, child_url, replace)

    run(
        [
            "tile-join",
            "-o",
            f"{settings.OUT_SCRATCH}/{out_name}.pmtiles",
            parent_path,
            child_path,
            "--no-tile-size-limit",
            "--force",
        ]
    )


@cli.command("load-districtr-v1-places")
@click.option("--replace", is_flag=True, help="Replace existing files", default=False)
def load_districtr_v1_places(replace: bool = False) -> None:
    """
    Load data from districtr_v1 endpoint to the s3 bucket for later ingestion
    """
    districtr_places = urlretrieve(
        "https://districtr.org/assets/data/landing_pages.json?v=2",
        settings.OUT_SCRATCH / "districtr_v1_places.json",
    )

    s3_client = settings.get_s3_client()

    key = f"{S3_PREFIX}/districtr_places/districtr_v1_places.json"
    print(s3_client, settings.S3_BUCKET, key)
    s3_client.upload_file(districtr_places, settings.S3_BUCKET, key)


def upsert_places_and_problems():
    """
    Upsert places and problems from districtr_v1.
    WIP/not functional port of load_dv1_places_and_problems_problems in #167
    """

    raise NotImplementedError

    s3_client = settings.get_s3_client()

    key = f"{S3_PREFIX}/districtr_places/districtr_v1_places.json"
    districtr_places = download_file_from_s3(s3_client, urlparse(key))

    if not districtr_places:
        LOGGER.error("Failed to download districtr_v1_places.json")
        return

    with open(districtr_places, "r") as file:
        places = json.load(file)

    for place in places:
        url = place["state"]
        LOGGER.info(f"Downloading problems for {url}")
        try:
            problems = urlretrieve(
                f"https://districtr.org/assets/data/modules/{place['state'].lower()}.json",
                settings.OUT_SCRATCH / f"{place['state'].lower()}_problems.json",
            )
            key = (
                f"{S3_PREFIX}/districtr_problems/{place['state'].lower()}_problems.json"
            )
            s3_client.upload_file(problems, settings.S3_BUCKET, key)
        except Exception as e:
            LOGGER.error(f"Failed to download problems for {url}: {e}")
            continue

    # load districtr_v1 places and problems
    load_districtr_v1_places()
    load_districtr_v1_problems()


@cli.command("load-districtr-v1-problems")
@click.option("--replace", is_flag=True, help="Replace existing files", default=False)
def load_districtr_v1_problems(replace: bool = False) -> None:
    """
    load problems definition json file for states from districtr_v1 and store in s3 bucket
    """
    s3_client = settings.get_s3_client()

    # check if the districtr_places object exists in s3; if not, download it using load_districtr_v1_places
    key = f"{S3_PREFIX}/districtr_places/districtr_v1_places.json"
    if not exists_in_s3(s3_client, settings.S3_BUCKET, key):
        load_districtr_v1_places()

    districtr_places = download_file_from_s3(s3_client, urlparse(key), replace)

    with open(districtr_places, "r") as file:
        places = json.load(file)

    for place in places:
        url = place["state"]
        LOGGER.info(f"Downloading problems for {url}")
        try:
            problems = urlretrieve(
                f"https://districtr.org/assets/data/modules/{place['state'].lower()}.json",
                settings.OUT_SCRATCH / f"{place['state'].lower()}_problems.json",
            )
            key = (
                f"{S3_PREFIX}/districtr_problems/{place['state'].lower()}_problems.json"
            )
            s3_client.upload_file(problems, settings.S3_BUCKET, key)
        except Exception as e:
            LOGGER.error(f"Failed to download problems for {url}: {e}")
            continue


if __name__ == "__main__":
    cli()
