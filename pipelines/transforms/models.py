from pydantic import BaseModel
import geopandas as gpd
import pandas as pd
from typing import Literal
from core.settings import settings
from core.io import download_file_from_s3
from urllib.parse import urlparse
import logging
from core.constants import S3_GERRYDB_PREFIX
import sqlite3

LOGGER = logging.getLogger(__name__)
AGGREGATE_ID_LENS = {"block-group": 12, "tract": 11, "county": 5}


class AggregateConfig(BaseModel):
    """
    Configuration for aggregating geographic data from blocks to higher-level geographies.

    This model handles the configuration and execution of geographic data aggregation,
    including optional creation of adjacency graphs.
    """

    blocks_geopackage: str
    layer_name: str
    aggregate_to: Literal["block-group", "tract", "county"]
    parent_gpkg: str
    parent_layer_name: str
    parent_id_column: str
    graph_layer_name: str | None = "gerrydb_graph_edge"
    out_path: str
    replace: bool
    upload: bool

    def get_gdf(self) -> gpd.GeoDataFrame:
        """
        Loads the geographic data from the specified geopackage.

        Downloads the file from S3 if necessary and loads it into a GeoDataFrame.

        Returns:
            gpd.GeoDataFrame: The loaded geographic data
        """
        s3 = settings.get_s3_client()

        blocks_url = urlparse(self.blocks_geopackage)
        LOGGER.info("Parent URL: %s", blocks_url)

        parent_path = self.blocks_geopackage

        if blocks_url.scheme == "s3":  # pragma: no cover
            assert s3, "S3 client is not available"
            parent_path = download_file_from_s3(s3, blocks_url, self.replace)

        gdf = gpd.read_file(parent_path)
        return gdf

    def aggregate_gdf(self) -> gpd.GeoDataFrame:
        """
        Aggregates block-level data to the specified geographic level.

        Dissolves geometries based on the specified aggregation level and
        sums numeric attributes.

        Returns:
            gpd.GeoDataFrame: The aggregated geographic data
        """
        gdf = self.get_gdf()
        gdf["path"] = gdf["path"].str[: AGGREGATE_ID_LENS[self.aggregate_to]]
        stat_columns = [col for col in gdf.columns if col not in ["path", "geometry"]]
        grouped_stats = (
            gdf[stat_columns + ["path"]]
            .groupby("path")
            .sum(numeric_only=True)
            .reset_index()
        )
        parent_geos = gpd.read_file(self.parent_gpkg, layer=self.parent_layer_name)[
            [self.parent_id_column, "geometry"]
        ].rename(columns={self.parent_id_column: "path"})
        if parent_geos.crs != gdf.crs:
            parent_geos = parent_geos.to_crs(gdf.crs)
        return parent_geos.merge(grouped_stats, on="path", how="left")

    def get_edges(self) -> pd.DataFrame:
        """
        Extracts edge graph from gerrydb blocks data.

        Returns:
            pd.DataFrame: A DataFrame containing edge relationships between geographic units
        """
        block_edges = gpd.read_file(self.blocks_geopackage, layer=self.graph_layer_name)
        # Trim the IDs to the appropriate length for the aggregation level
        # Any block contiguity between parent IDs
        # will remain true when aggregated to the parents
        block_edges["path_1"] = block_edges["path"].str[
            : AGGREGATE_ID_LENS[self.aggregate_to]
        ]
        block_edges["path_2"] = block_edges["path"].str[
            AGGREGATE_ID_LENS[self.aggregate_to] :
        ]
        # Remove internal block edges and duplicates
        block_edges = block_edges.query("path_1 != path_2").drop_duplicates(
            ["path_1", "path_2"]
        )
        return block_edges

    def generate_aggregated_gpkg(self) -> gpd.GeoDataFrame:
        """
        Executes the aggregation process and saves the results.

        Aggregates the geographic data, optionally creates an adjacency graph,
        and saves both to the specified output path.

        Returns:
            tuple: A tuple containing (aggregated GeoDataFrame, edges DataFrame or None)
        """
        aggregated = self.aggregate_gdf()
        aggregated.to_file(settings.OUT_SCRATCH / self.out_path, driver="GPKG")

        edges = self.get_edges()
        conn = sqlite3.connect(settings.OUT_SCRATCH / self.out_path)
        edges.to_sql(self.graph_layer_name, conn, if_exists="replace", index=False)

        conn.close()
        if self.upload:  # pragma: no cover
            s3_client = settings.get_s3_client()
            if not s3_client:
                raise ValueError("Failed to get S3 client")

            s3_key = f"{S3_GERRYDB_PREFIX}/{self.out_path}"
            s3_client.upload_file(
                settings.OUT_SCRATCH / self.out_path, settings.S3_BUCKET, s3_key
            )

        return aggregated, edges
