import click
import logging
from core.settings import settings
from core.constants import S3_TABULAR_PREFIX
from tabular.models import TabularBatch
from core.cli import cli

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@cli.group()
def tabular() -> None:
    """Tabular analysis commands."""
    pass

@tabular.command("build-parquet")
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
@click.option("--replace", "-f", help="Replace files if they exist", is_flag=True)
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
    df = TabularBatch.merge_and_melt_df(parent_layer, child_layer, out_path, replace)
    if df is not None:
        TabularBatch.output_parquet(df, out_path)
    else:
        logger.info("File already exists. Skipping creation.")

    if upload:
        logger.info(f"Uploading {out_path} to S3.")
        s3_client = settings.get_s3_client()
        s3_client.upload_file(
            settings.OUT_SCRATCH / out_path,
            settings.S3_BUCKET,
            f"{S3_TABULAR_PREFIX}/{out_path}",
        )


@tabular.command("batch-build-parquet")
@click.option("--config-path", help="Path to the config file", required=True)
@click.option("--data-dir", help="Path to the data directory", required=True)
@click.option("--replace", "-f", help="Replace files they exist", is_flag=True)
@click.option("--upload", "-u", help="Upload to S3", is_flag=True)
def batch_build_parquet(
    config_path: str, data_dir: str, replace: bool, upload: bool
) -> None:
    """
    Build a parquet file from a config file.
    """
    tabular_batch = TabularBatch.from_file(file_path=config_path)
    tabular_batch.create_all(replace=replace, data_dir=data_dir)
    if upload:
        tabular_batch.upload_all()