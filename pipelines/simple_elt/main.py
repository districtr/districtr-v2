import geopandas as gpd
import pandas as pd
import duckdb

import os
import click
import logging
from urllib.parse import urlparse
from subprocess import run

from files import download_and_unzip_zipfile, exists_in_s3
from settings import settings
TIGER_YEAR = 2023
WISCONSIN_2023_TABBLOCK20 = (
    f"https://www2.census.gov/geo/tiger/TIGER2023/TABBLOCK20/tl_{TIGER_YEAR}_55_tabblock20.zip"
)
BLOCK_COLS = ["GEOID20", "ALAND20", "POP20", "HOUSING20", "geometry"]

S3_PREFIX = "basemaps"

TIGER_COUNTY_URL = (
    "https://www2.census.gov/geo/tiger/TIGER2023/COUNTY/tl_2023_us_county.zip"
)
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
    if replace or not os.path.exists(settings.OUT_SCRATCH / "tl_{TIGER_YEAR}_us_county.zip"):
        LOGGER.info("Downloading county shapefile")
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
        duckdb.execute(f"""
            INSTALL SPATIAL; LOAD spatial;
            COPY (
                SELECT
                    GEOID,
                    NAME,
                    ST_Centroid(geom) as geometry,
                FROM st_read('{fgb}')
            ) TO '{label_fgb}'
            WITH (FORMAT GDAL, DRIVER 'FlatGeobuf', SRS 'EPSG:4326')
            """)

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
    if not os.path.exists(f"{settings.OUT_SCRATCH}/tl_2023_55_tabblock20.zip"):
        download_and_unzip_zipfile(WISCONSIN_2023_TABBLOCK20, settings.OUT_SCRATCH)

    gdf = gpd.read_file(f"{settings.OUT_SCRATCH}/tl_2023_55_tabblock20.shp")[
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
        f"{settings.OUT_SCRATCH}/tl_2023_55_tabblock20.parquet",
        compression="brotli",
        row_group_size=len(gdf),
        index=False,
    )


if __name__ == "__main__":
    cli()
