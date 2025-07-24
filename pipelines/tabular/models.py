from core.models import Config
from pydantic import BaseModel, ConfigDict
import os
import logging
from core.settings import settings
import pandas as pd
import geopandas as gpd
import duckdb
from core.constants import S3_TABULAR_PREFIX

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class TabularConfig(BaseModel):
    parent_gpkg: str
    child_gpkg: str
    out_path: str

    model_config = ConfigDict(arbitrary_types_allowed=True)


class TabularBatch(Config):
    datasets: dict[str, TabularConfig]
    _results: dict[str, str] = {}

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @classmethod
    def merge_and_melt_df(
        cls, parent_layer: str, child_layer: str, out_path: str, replace: bool = False
    ) -> pd.DataFrame | None:
        if not replace and os.path.exists(settings.OUT_SCRATCH / out_path):
            logger.info("File already exists. Skipping creation.")
            return None
        else:
            logger.info(
                f"Building tabular parquet from {parent_layer} and {child_layer}."
            )

            parent_gdf = gpd.read_file(parent_layer)
            logger.info(f"Read parent layer :: {len(parent_gdf)} rows")
            child_gdf = gpd.read_file(child_layer)
            logger.info(f"Read child layer :: {len(child_gdf)} rows")
            # sjoin to find parent
            parents_min = parent_gdf[["geometry", "path"]].rename(
                columns={"path": "parent_path"}
            )
            child_gdf = gpd.sjoin(
                child_gdf, parents_min, how="left", predicate="within"
            )
            logger.info(
                f"Joined child layer with parent layer :: {len(child_gdf)} rows"
            )
            parent_gdf["parent_path"] = "__parent"
            # drop geometry
            parent_gdf = parent_gdf.drop(columns=["geometry"])
            child_gdf = child_gdf.drop(columns=["geometry"])
            full_df = pd.concat([parent_gdf, child_gdf], ignore_index=True)
            full_df = (
                full_df.melt(
                    id_vars=["path", "parent_path"],
                    var_name="column_name",
                    value_name="value",
                )
                .sort_values(["parent_path", "path", "column_name"])
                .reset_index()
            )
            full_df.to_parquet(
                settings.OUT_SCRATCH
                / out_path.replace(".parquet", "_temp_long.parquet")
            )
            logger.info("Transformed data to long format.")
            return full_df

    @classmethod
    def output_parquet(cls, df: pd.DataFrame | None, out_path: str) -> None:
        if df is None:
            return
        con = duckdb.connect(database=":memory:")
        con.sql(
            f"""
          CREATE TABLE data AS SELECT * FROM read_parquet('{settings.OUT_SCRATCH / out_path.replace(".parquet", "_temp_long.parquet")}')
          """
        )
        logger.info(f"Outputting data to {out_path}.")
        con.execute("SET threads=1;")
        con.sql(
            f"""
              COPY (
                  SELECT
                      parent_path,
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
                  ROW_GROUP_SIZE 10_000
              );
            """
        )
        logger.info(f"Output {out_path} to {settings.OUT_SCRATCH / out_path}.")
        con.close()

    def create_all(self, replace: bool = False, data_dir: str | None = None):
        for dataset in self.datasets.values():
            parent_layer = dataset.parent_gpkg
            child_layer = dataset.child_gpkg
            out_path = dataset.out_path

            logger.info(
                f"Creating tabular parquet from {parent_layer} and {child_layer}."
            )
            logger.info(f"Data dir: {data_dir}")
            if data_dir is not None:
                parent_layer = os.path.join(data_dir, parent_layer)
                child_layer = os.path.join(data_dir, child_layer)
            df = self.merge_and_melt_df(parent_layer, child_layer, out_path, replace)
            self.output_parquet(df, out_path)

    def upload_all(self):
        s3_client = settings.get_s3_client()
        logger.info("Uploading results to S3")
        if not s3_client:
            raise ValueError("Failed to get S3 client")
        for dataset in self.datasets.values():
            out_path = dataset.out_path
            s3_client.upload_file(
                settings.OUT_SCRATCH / out_path,
                settings.S3_BUCKET,
                f"{S3_TABULAR_PREFIX}/{out_path}",
            )
            logger.info(f"Uploaded {out_path}")
