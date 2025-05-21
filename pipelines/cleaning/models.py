from pydantic import BaseModel
import geopandas as gpd
from typing import Literal
from core.settings import settings
from core.utils import download_file_from_s3
from urllib.parse import urlparse
import logging
import libpysal
import pandas as pd
import sqlite3
from core.constants import S3_GERRYDB_PREFIX

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
    build_edges: bool
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
        gdf["agg_path"] = gdf["path"].str[: AGGREGATE_ID_LENS[self.aggregate_to]]
        dissolved_geos = (
            gdf[["agg_path", "geometry"]].dissolve(by="agg_path").reset_index()
        )
        stat_columns = [
            col for col in gdf.columns if col not in ["agg_path", "path", "geometry"]
        ]
        grouped_stats = (
            gdf[stat_columns + ["agg_path"]]
            .groupby("agg_path")
            .sum(numeric_only=True)
            .reset_index()
        )
        merged = dissolved_geos.merge(grouped_stats, on="agg_path", how="left")
        merged["path"] = merged["agg_path"]
        merged.drop(columns=["agg_path"], inplace=True)
        return merged

    def get_edges(self, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        """
        Creates an adjacency graph from the geographic data.

        Uses rook contiguity to determine adjacency between geographic units.

        Args:
            gdf (gpd.GeoDataFrame): The geographic data to create edges from

        Returns:
            pd.DataFrame: A DataFrame containing edge relationships between geographic units
        """
        rook_weights = libpysal.weights.Rook.from_dataframe(gdf, geom_col="geometry")
        edges = []
        for index, row in gdf.iterrows():
            neighbors = rook_weights.neighbors[index]
            for neighbor in neighbors:
                edges.append((row["path"], gdf.iloc[neighbor]["path"], "{}"))
        return pd.DataFrame(edges, columns=["path_1", "path_2", "weights"])

    def generate_aggregated_gpkg(self) -> gpd.GeoDataFrame:
        """
        Executes the aggregation process and saves the results.

        Aggregates the geographic data, optionally creates an adjacency graph,
        and saves both to the specified output path.

        Returns:
            tuple: A tuple containing (aggregated GeoDataFrame, edges DataFrame or None)
        """
        gdf = self.aggregate_gdf()
        edges = self.get_edges(gdf) if self.build_edges else None

        # output to out_scratch
        gdf.to_file(settings.OUT_SCRATCH / self.out_path, driver="GPKG")
        if edges is not None:
            # Add to existing gpkg with null geometry
            # Convert edges DataFrame to SQLite and append to the GeoPackage file
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

        return gdf, edges
