import geopandas as gpd
import pandas as pd
import duckdb

import os
import click
from urllib.parse import urlparse
from subprocess import run

from files import download_and_unzip_zipfile, exists_in_s3
from settings import settings

WISCONSIN_2023_TABBLOCK20 = (
    "https://www2.census.gov/geo/tiger/TIGER2023/TABBLOCK20/tl_2023_55_tabblock20.zip"
)
BLOCK_COLS = ["GEOID20", "ALAND20", "POP20", "HOUSING20", "geometry"]

S3_PREFIX = "basemaps"

TIGER_COUNTY_URL = (
    "https://www2.census.gov/geo/tiger/TIGER2023/COUNTY/tl_2023_us_county.zip"
)
S3_TIGER_PREFIX = "tiger/tiger2023"


@click.group()
def cli():
    pass


@cli.command()
@click.option("--replace", is_flag=True, help="Replace existing files", default=False)
def create_county_tiles(replace: bool = False):
    if replace or not os.path.exists(settings.OUT_SCRATCH / "tl_2023_us_county.zip"):
        download_and_unzip_zipfile(TIGER_COUNTY_URL, settings.OUT_SCRATCH)

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

    s3_client = settings.get_s3_client()

    if replace or not exists_in_s3(s3_client, settings.S3_BUCKET, key):
        s3_client.upload_file(fgb, settings.S3_BUCKET, key)

    tiles = settings.OUT_SCRATCH / f"{file_name}.pmtiles"
    if replace or not tiles.exists():
        run(
            [
                "tippecanoe",
                "-o",
                tiles,
                "-l",
                file_name,
                "-zg",
                fgb,
                "--force",
            ],
            check=True,
        )

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
            WITH (FORMAT GDAL, DRIVER 'FlatGeobuf')
            """)

    label_tiles = settings.OUT_SCRATCH / f"{file_name}_label.pmtiles"
    if replace or not label_tiles.exists():
        run(
            [
                "tippecanoe",
                "-o",
                label_tiles,
                "-l",
                file_name + "_label",
                "-zg",
                label_fgb,
                "--force",
            ],
            check=True,
        )

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

    key = f"{S3_PREFIX}/{S3_TIGER_PREFIX}/{file_name}_full.pmtiles"
    if replace or not exists_in_s3(s3_client, settings.S3_BUCKET, key):
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
