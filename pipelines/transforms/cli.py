import click
import logging
from transforms.models import AggregateConfig
from transforms.graph import build_combined_graph_from_gpkg, write_graph, GraphBatch

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
    "--parent-id-column",
    "-i",
    help="Name of the column in the parent GeoPackage file that contains the ID",
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
    parent_gpkg: str,
    parent_layer_name: str,
    parent_id_column: str,
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
        parent_gpkg=parent_gpkg,
        parent_layer_name=parent_layer_name,
        parent_id_column=parent_id_column,
        aggregate_to=aggregate_to,
        graph_layer_name=graph_layer_name,
        out_path=out_path,
        replace=replace,
        upload=upload,
    )

    logger.info(f"Aggregating {layer_name} to {aggregate_to} level")
    config.generate_aggregated_gpkg()
    logger.info(f"Aggregation complete. Output saved to {out_path}")


@transforms.command("create-graph")
@click.option(
    "--child-gpkg",
    "-c",
    help="Path or S3 URI to block-level GeoPackage (must contain gerrydb_graph_edge layer)",
    required=True,
)
@click.option(
    "--parent-gpkg",
    "-p",
    help="Path or S3 URI to parent-level GeoPackage",
    required=True,
)
@click.option(
    "--gerrydb-name",
    "-g",
    help="GerryDB table name for the map (used as the output filename)",
    required=True,
)
@click.option(
    "--child-layer-name",
    default=None,
    help="Layer name in child GeoPackage (default: gpkg filename stem)",
)
@click.option(
    "--parent-layer-name",
    default=None,
    help="Layer name in parent GeoPackage (default: gpkg filename stem)",
)
@click.option(
    "--out-path",
    "-o",
    default=None,
    help="Override output path (default: OUT_SCRATCH/graphs/<gerrydb-name>.pkl)",
)
@click.option(
    "--upload",
    "-u",
    is_flag=True,
    default=False,
    help="Upload the graph pkl to S3 after writing",
)
@click.option(
    "--graph-edge-layer",
    default="gerrydb_graph_edge",
    help="Edge layer name in the child GeoPackage",
)
def create_graph(
    child_gpkg: str,
    parent_gpkg: str,
    gerrydb_name: str,
    child_layer_name: str | None,
    parent_layer_name: str | None,
    out_path: str | None,
    upload: bool,
    graph_edge_layer: str,
) -> None:
    """Build a dual-level combined graph pkl from two GeoPackage files.

    No database access required — parent-child relationships are derived from
    a spatial join of the child and parent GeoPackage geometries.
    """
    logger.info("Building graph for %r", gerrydb_name)
    G = build_combined_graph_from_gpkg(
        child_gpkg=child_gpkg,
        parent_gpkg=parent_gpkg,
        child_layer_name=child_layer_name,
        parent_layer_name=parent_layer_name,
        graph_edge_layer=graph_edge_layer,
    )
    path = write_graph(G, gerrydb_name, out_path=out_path, upload_to_s3=upload)
    logger.info("Done. Graph written to %s", path)


@transforms.command("batch-create-graphs")
@click.option("--config-path", required=True, help="Path to graph batch config YAML")
@click.option("--data-dir", default=None, help="Directory containing gpkg files")
@click.option(
    "--replace", "-f", is_flag=True, default=False, help="Rebuild even if output exists"
)
@click.option(
    "--upload",
    "-u",
    is_flag=True,
    default=False,
    help="Upload graphs to S3 after building",
)
def batch_create_graphs(
    config_path: str, data_dir: str | None, replace: bool, upload: bool
) -> None:
    """Build dual-level graph pkls for all maps in a batch config file."""
    batch = GraphBatch.from_file(file_path=config_path)
    batch.create_all(data_dir=data_dir, replace=replace, upload=upload)
