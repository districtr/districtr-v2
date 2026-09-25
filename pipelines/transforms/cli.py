import click
import logging
from transforms.graph import build_combined_graph_from_gpkg, write_graph, GraphBatch
from transforms.block_columns import add_block_columns

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.group()
def transforms() -> None:
    """Data transforms pipeline commands."""
    pass


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
    help="Override output path prefix (default: OUT_SCRATCH/graphs/<gerrydb-name>)",
)
@click.option(
    "--upload",
    "-u",
    is_flag=True,
    default=False,
    help="Upload the graph files to S3 after writing",
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
    paths = write_graph(G, gerrydb_name, out_path=out_path, upload_to_s3=upload)
    logger.info("Done. Graph written to %s", ", ".join(str(p) for p in paths))


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


@transforms.command("add-block-columns")
@click.option(
    "--blocks-gpkg",
    "-b",
    required=True,
    help="Path or s3 URI of the block GeoPackage; layer name = file stem",
)
@click.option(
    "--parent-gpkg",
    "-p",
    required=True,
    help="Path or s3 URI of the parent GeoPackage; layer name = file stem",
)
@click.option("--csv", "csv_path", required=True, help="Block-level CSV to add")
@click.option(
    "--id-column", default="geoid20", help="CSV column holding the block path"
)
@click.option(
    "--columns",
    default=None,
    help="Comma-separated CSV columns to add (default: all but the id column)",
)
@click.option("--out-dir", default=None, help="Output directory (default: OUT_SCRATCH)")
@click.option(
    "--replace",
    "-f",
    is_flag=True,
    default=False,
    help="Overwrite columns that already exist in either layer",
)
def add_block_columns_cmd(
    blocks_gpkg: str,
    parent_gpkg: str,
    csv_path: str,
    id_column: str,
    columns: str | None,
    out_dir: str | None,
    replace: bool,
) -> None:
    """Add block-level CSV columns to a block GeoPackage and sum them into its parent."""
    blocks_out, parent_out = add_block_columns(
        blocks_gpkg=blocks_gpkg,
        parent_gpkg=parent_gpkg,
        csv_path=csv_path,
        id_column=id_column,
        columns=columns.split(",") if columns else None,
        out_dir=out_dir,
        replace=replace,
    )
    logger.info(f"Wrote {blocks_out} and {parent_out}")
