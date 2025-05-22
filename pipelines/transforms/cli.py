import click
import logging
from .models import AggregateConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.group()
def transforms() -> None:
    """Data transforms pipeline commands."""
    pass


@transforms.command("aggregate")
@click.option(
    "--blocks-gpkg",
    "-b",
    help="Path or URL to blocks GeoPackage file. If URL, must be s3 URI",
    required=True,
)
@click.option(
    "--layer-name",
    "-l",
    help="Name of the layer in the GeoPackage file",
    required=True,
)
@click.option(
    "--aggregate-to",
    "-a",
    type=click.Choice(["block-group", "tract", "county"]),
    help="Geographic level to aggregate to",
    required=True,
)
@click.option(
    "--parent-gpkg",
    "-p",
    help="Path or URL to parent GeoPackage file. If URL, must be s3 URI",
    required=True,
)
@click.option(
    "--parent-layer-name",
    "-n",
    help="Name of the layer in the parent GeoPackage file",
    required=True,
)
@click.option(
    "--graph-layer-name",
    "-g",
    help="Name of the graph edges layer in output GeoPackage",
    default="gerrydb_graph_edge",
)
@click.option(
    "--out-path",
    "-o",
    help="Output path for the aggregated GeoPackage",
    required=True,
)
@click.option(
    "--replace",
    "-f",
    help="Replace files if they exist",
    is_flag=True,
    default=False,
)
@click.option(
    "--upload",
    "-u",
    help="Upload the output to S3",
    is_flag=True,
    default=False,
)
def aggregate(
    blocks_gpkg: str,
    layer_name: str,
    aggregate_to: str,
    build_edges: bool,
    graph_layer_name: str,
    out_path: str,
    replace: bool,
    upload: bool,
) -> None:
    """
    Aggregate block-level data to a higher geographic level (block group, tract, or county).
    Optionally builds graph edges between adjacent geometries.
    """
    config = AggregateConfig(
        blocks_geopackage=blocks_gpkg,
        layer_name=layer_name,
        aggregate_to=aggregate_to,
        build_edges=build_edges,
        graph_layer_name=graph_layer_name,
        out_path=out_path,
        replace=replace,
        upload=upload,
    )

    logger.info(f"Aggregating {layer_name} to {aggregate_to} level")
    config.generate_aggregated_gpkg()
    logger.info(f"Aggregation complete. Output saved to {out_path}")
