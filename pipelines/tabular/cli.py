import duckdb
import os
import click
import logging
from core.settings import settings
from core.constants import (
    S3_TABULAR_PREFIX
)
import geopandas as gpd
import pandas as pd

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.group()
def cli():
    pass


@cli.command("build-parquet")
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
@click.option("--out-path", "-o", help="Path to the output parquet file", required=True)
@click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
@click.option("--upload", "-u", help="Upload to S3", is_flag=True)
def build_parquet(
    parent_layer: str,
    child_layer: str,
    out_path: str,
    replace: bool,
    upload: bool,
) -> None:
    """
    Build a parquet file from a parent and child layer.
    """
    if not replace and os.path.exists(settings.OUT_SCRATCH / out_path):
      logger.info(f"File already exists. Skipping creation.")
    else:
      logger.info(f"Building tabular parquet from {parent_layer} and {child_layer}.")

      parent_gdf = gpd.read_file(parent_layer)
      logger.info(f"Read parent layer :: {len(parent_gdf)} rows")
      child_gdf = gpd.read_file(child_layer)
      logger.info(f"Read child layer :: {len(child_gdf)} rows")
      # sjoin to find parent
      parents_min = parent_gdf[['geometry','path']].rename(columns={'path':'parent_path'})
      child_gdf = gpd.sjoin(child_gdf, parents_min, how='left', predicate='within')
      logger.info(f"Joined child layer with parent layer :: {len(child_gdf)} rows")
      parent_gdf['parent_path'] = 'parent'
      # drop geometry
      parent_gdf = parent_gdf.drop(columns=['geometry'])
      child_gdf = child_gdf.drop(columns=['geometry'])
      full_df = pd.concat([parent_gdf, child_gdf], ignore_index=True)
      full_df = full_df.melt(id_vars=['path', 'parent_path'], var_name='column_name', value_name='value')\
        .sort_values(['parent_path', 'path', 'column_name']).reset_index()
      full_df.to_parquet(settings.OUT_SCRATCH / out_path.replace('.parquet', '_temp_long.parquet'))
      logger.info(f"Transformed data to long format.")
      grouped = full_df.groupby("parent_path").apply(lambda x: int(x.index.max()) - int(x.index.min()))
      con = duckdb.connect(database=":memory:")
      con.sql(
          f"""
          CREATE TABLE data AS SELECT * FROM read_parquet('{settings.OUT_SCRATCH / out_path.replace('.parquet', '_temp_long.parquet')}')
          """
      )
      logger.info(f"Outputting data to {out_path}.")
      con.execute("SET threads=1;")
      con.sql(
        f"""
        COPY (
            SELECT
                path,
                column_name,
                value
            FROM data
        )
        TO '{settings.OUT_SCRATCH / out_path}'
        (
            FORMAT 'parquet',
            COMPRESSION 'zstd',
            COMPRESSION_LEVEL 12,
            OVERWRITE_OR_IGNORE true,
            KV_METADATA {{
              column_list: {[f'"{entry}"' for entry in full_df['column_name'].unique().tolist()]},
              length_list: {list(grouped.values)}
            }}
        );
        """
      )
    if upload:
        logger.info(f"Uploading {out_path} to S3.")
        s3_client = settings.get_s3_client()
        s3_client.upload_file(settings.OUT_SCRATCH / out_path, settings.S3_BUCKET, f"{S3_TABULAR_PREFIX}/{out_path}")



# @cli.command("batch-create-tilesets")
# @click.option("--config-path", help="Path to the config file", required=True)
# @click.option(
#     "--data-dir",
#     "-d",
#     help="Path to data directory where the geopackages are located or will be downloaded to",
#     required=False,
#     default=None,
# )
# @click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
# @click.option("--upload", "-u", help="Upload tileset results to S3", is_flag=True)
# def batch_create_tilesets(
#     config_path: str, data_dir: str | None, replace: bool, upload: bool
# ) -> None:
#     """
#     Batch create tilesets from a config file. Does not upload the tileset to S3. Use the s3 cli for that.
#     """
#     if not os.path.exists(settings.OUT_SCRATCH):
#         os.makedirs(settings.OUT_SCRATCH)

#     tileset_batch = TilesetBatch.from_file(file_path=config_path)
#     tileset_batch.create_all(replace=replace, data_dir=data_dir)

#     if upload:
#         tileset_batch.upload_results()


# @cli.command()
# @click.option("--replace", is_flag=True, help="Replace existing files", default=False)
# @click.option("--upload", is_flag=True, help="Upload files to S3", default=False)
# def create_county_tiles(replace: bool = False, upload: bool = False):
#     logger.info("Creating county tiles")
#     if replace or not os.path.exists(
#         settings.OUT_SCRATCH / "tl_{TIGER_YEAR}_us_county.zip"
#     ):
#         logger.info(f"Downloading county shapefile from {TIGER_COUNTY_URL}")
#         download_and_unzip_zipfile(TIGER_COUNTY_URL, settings.OUT_SCRATCH)

#     logger.info("Creating county FGB")
#     file_name = urlparse(TIGER_COUNTY_URL).path.split("/")[-1].split(".")[0]
#     fgb = settings.OUT_SCRATCH / f"{file_name}.fgb"

#     if replace or not fgb.exists():
#         run(
#             [
#                 "ogr2ogr",
#                 "-f",
#                 "FlatGeobuf",
#                 "-t_srs",
#                 "EPSG:4326",
#                 "-nlt",
#                 "PROMOTE_TO_MULTI",
#                 fgb,
#                 settings.OUT_SCRATCH / f"{file_name}.shp",
#                 file_name,
#             ],
#             check=True,
#         )

#     key = f"{S3_BASEMAPS_PREFIX}/{S3_TIGER_PREFIX}/{file_name}.fgb"

#     logger.info("Creating county tiles")
#     tiles = settings.OUT_SCRATCH / f"{file_name}.pmtiles"
#     if replace or not tiles.exists():
#         run(
#             [
#                 "tippecanoe",
#                 "-z12",  # max zoom 12
#                 "-Z2",  # min zoom 2
#                 "-pS",  # at zoom 12, NO simplification
#                 "--drop-densest-as-needed",
#                 "--extend-zooms-if-still-dropping",
#                 "-o",
#                 tiles,
#                 "-l",
#                 file_name,
#                 fgb,
#                 "--force",
#             ],
#             check=True,
#         )

#     logger.info("Creating county label centroids")
#     label_fgb = settings.OUT_SCRATCH / f"{file_name}_label.fgb"
#     if replace or not label_fgb.exists():
#         duckdb.execute(
#             f"""
#             INSTALL SPATIAL; LOAD spatial;
#             COPY (
#                 SELECT
#                     GEOID,
#                     NAME,
#                     ST_Centroid(geom) as geometry,
#                 FROM st_read('{fgb}')
#             ) TO '{label_fgb}'
#             WITH (FORMAT GDAL, DRIVER 'FlatGeobuf', SRS 'EPSG:4326')
#             """
#         )

#     logger.info("Creating county label tiles")
#     label_tiles = settings.OUT_SCRATCH / f"{file_name}_label.pmtiles"
#     if replace or not label_tiles.exists():
#         run(
#             [
#                 "tippecanoe",
#                 "-z10",
#                 "-Z6",
#                 "-r1",
#                 "--cluster-distance=10",
#                 "-o",
#                 label_tiles,
#                 "-l",
#                 file_name + "_label",
#                 label_fgb,
#                 "--force",
#             ],
#             check=True,
#         )

#     logger.info("Combining tiles")
#     combined_tiles = settings.OUT_SCRATCH / f"{file_name}_full.pmtiles"
#     run(
#         [
#             "tile-join",
#             "--force",
#             "-o",
#             combined_tiles,
#             tiles,
#             label_tiles,
#         ]
#     )

#     s3_client = settings.get_s3_client()

#     key = f"{S3_BASEMAPS_PREFIX}/{S3_TIGER_PREFIX}/{file_name}_full.pmtiles"
#     if upload or not exists_in_s3(s3_client, settings.S3_BUCKET, key):
#         logger.info("Uploading combined tiles to S3")
#         assert s3_client is not None, "S3 client is not initialized"
#         s3_client.upload_file(combined_tiles, settings.S3_BUCKET, key)


# if __name__ == "__main__":
#     cli()
