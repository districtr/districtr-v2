import click
import logging

from app.core.db import engine
from app.core.config import settings
from sqlalchemy import text
from app.utils import (
    create_districtr_map as _create_districtr_map,
    create_shatterable_gerrydb_view as _create_shatterable_gerrydb_view,
    create_parent_child_edges as _create_parent_child_edges,
    add_extent_to_districtrmap as _add_extent_to_districtrmap,
    add_available_summary_stats_to_districtrmap as _add_available_summary_stats_to_districtrmap,
    update_districtrmap as _update_districtrmap,
    get_local_or_s3_path,
)
from functools import wraps
from contextlib import contextmanager
from sqlmodel import Session
from typing import Callable, TypeVar, Any
from management.load_data import (
    load_sample_data,
    Config,
    import_gerrydb_view as _import_gerrydb_view,
)
from os import environ

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

GPKG_DATA_DIR = environ.get("GPKG_DATA_DIR", settings.VOLUME_PATH)

T = TypeVar("T")


@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def with_session(f: Callable[..., T]) -> Callable[..., T]:
    """
    Decorator that handles database session creation and cleanup.
    Compatible with Click commands.
    """

    @wraps(f)
    def decorator(*args: Any, **kwargs: Any) -> T:
        with session_scope() as session:
            kwargs["session"] = session
            return f(*args, **kwargs)

    return decorator


@click.group()
def cli():
    pass


@cli.command("import-gerrydb-view")
@click.option("--layer", "-n", help="layer of the view", required=True)
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
@click.option("--rm", "-r", help="Delete file after loading to postgres", is_flag=True)
@with_session
def import_gerrydb_view(
    session: Session, layer: str, gpkg: str, replace: bool, rm: bool
):
    _import_gerrydb_view(
        session=session,
        layer=layer,
        gpkg=gpkg,
        rm=rm,
    )


@cli.command("create-parent-child-edges")
@click.option("--districtr-map", "-d", help="Districtr map name", required=True)
@with_session
def create_parent_child_edges(session: Session, districtr_map: str):
    logger.info("Creating parent-child edges...")

    stmt = text(
        "SELECT uuid FROM districtrmap WHERE gerrydb_table_name = :districtrmap_name"
    )
    (districtr_map_uuid,) = session.execute(
        stmt, params={"districtrmap_name": districtr_map}
    ).one()
    logger.info(f"Found districtmap uuid: {districtr_map_uuid}")

    _create_parent_child_edges(session=session, districtr_map_uuid=districtr_map_uuid)
    logger.info("Parent-child relationship upserted successfully.")


@cli.command("delete-parent-child-edges")
@click.option("--districtr-map", "-d", help="Districtr map name", required=True)
@with_session
def delete_parent_child_edges(session: Session, districtr_map: str):
    logger.info("Deleting parent-child edges...")

    delete_query = text(
        """
        DELETE FROM parentchildedges
        WHERE districtr_map = :districtr_map
    """
    )
    session.execute(
        delete_query,
        {
            "districtr_map": districtr_map,
        },
    )
    logger.info("Parent-child relationship upserted successfully.")


@cli.command("create-districtr-map")
@click.option("--name", help="Name of the districtr map", required=True)
@click.option("--parent-layer-name", help="Parent gerrydb layer name", required=True)
@click.option("--child-layer-name", help="Child gerrydb layer name", required=False)
@click.option("--gerrydb-table-name", help="Name of the GerryDB table", required=True)
@click.option("--num-districts", help="Number of districts", required=False)
@click.option("--tiles-s3-path", help="S3 path to the tileset", required=False)
@click.option(
    "--no-extent", help="Do not calculate extent", is_flag=True, default=False
)
@click.option(
    "--bounds",
    "-b",
    help="Bounds of the extent as `--bounds x_min y_min x_max y_max`",
    required=False,
    type=float,
    default=None,
    nargs=4,
)
@with_session
def create_districtr_map(
    session: Session,
    name: str,
    parent_layer: str,
    child_layer: str | None,
    gerrydb_table_name: str,
    num_districts: int | None,
    tiles_s3_path: str | None,
    no_extent: bool = False,
    bounds: list[float] | None = None,
):
    logger.info("Creating districtr map...")
    districtr_map_uuid = _create_districtr_map(
        session=session,
        name=name,
        parent_layer=parent_layer,
        child_layer=child_layer,
        gerrydb_table_name=gerrydb_table_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
    )

    if not no_extent:
        logger.info(
            f"Calculating extent... bounds received: {bounds}. If none will use parent layer extent."
        )
        _add_extent_to_districtrmap(
            session=session, districtr_map_uuid=districtr_map_uuid, bounds=bounds
        )

    _add_available_summary_stats_to_districtrmap(
        session=session, districtr_map_uuid=districtr_map_uuid
    )

    logger.info(f"Districtr map created successfully {districtr_map_uuid}")


@cli.command("update-districtr-map")
@click.option(
    "--gerrydb-table-name",
    "-n",
    help="Name of the GerryDB table",
    type=str,
    required=True,
)
@click.option("--name", help="Name of the districtr map", type=str, required=False)
@click.option(
    "--parent-layer-name", help="Parent gerrydb layer name", type=str, required=False
)
@click.option(
    "--child-layer-name", help="Child gerrydb layer name", type=str, required=False
)
@click.option("--num-districts", help="Number of districts", type=str, required=False)
@click.option(
    "--tiles-s3-path", help="S3 path to the tileset", type=str, required=False
)
@click.option("--visibility", "-v", help="Visibility", type=bool, required=False)
@click.option(
    "--bounds",
    "-b",
    help="Bounds of the extent as `--bounds x_min y_min x_max y_max`",
    required=False,
    type=float,
    default=None,
    nargs=4,
)
@with_session
def update_districtr_map(
    session: Session,
    gerrydb_table_name: str,
    name: str | None,
    parent_layer_name: str | None,
    child_layer_name: str | None,
    num_districts: int | None,
    tiles_s3_path: str | None,
    visibility: bool = False,
    bounds: list[float] | None = None,
):
    logger.info("Updating districtr map...")

    _bounds = None
    if bounds and len(bounds) == 4:
        _bounds = bounds

    result = _update_districtrmap(
        session=session,
        gerrydb_table_name=gerrydb_table_name,
        name=name,
        parent_layer=parent_layer_name,
        child_layer=child_layer_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
        visible=visibility,
        bounds=_bounds,
    )
    logger.info(f"Districtr map updated successfully {result}")


@cli.command("create-shatterable-districtr-view")
@click.option("--parent-layer-name", help="Parent gerrydb layer name", required=True)
@click.option("--child-layer-name", help="Child gerrydb layer name", required=False)
@click.option("--gerrydb-table-name", help="Name of the GerryDB table", required=False)
@with_session
def create_shatterable_gerrydb_view(
    session: Session,
    parent_layer_name: str,
    child_layer_name: str,
    gerrydb_table_name: str,
):
    logger.info("Creating materialized shatterable gerrydb view...")
    inserted_uuid = _create_shatterable_gerrydb_view(
        session=session,
        parent_layer=parent_layer_name,
        child_layer=child_layer_name,
        gerrydb_table_name=gerrydb_table_name,
    )
    logger.info(
        f"Materialized shatterable gerrydb view created successfully {inserted_uuid}"
    )


@cli.command("add-extent-to-districtr-map")
@click.option("--districtr-map", "-d", help="Districtr map name", required=True)
@click.option(
    "--bounds",
    "-b",
    help="Bounds of the extent as `--bounds x_min y_min x_max y_max`",
    required=False,
    type=float,
    default=None,
    nargs=4,
)
@with_session
def add_extent_to_districtr_map(
    session: Session, districtr_map: str, bounds: list[float] | None = None
):
    logger.info(f"User provided bounds: {bounds}")

    stmt = text(
        "SELECT uuid FROM districtrmap WHERE gerrydb_table_name = :districtrmap_name"
    )
    (districtr_map_uuid,) = session.execute(
        stmt, params={"districtrmap_name": districtr_map}
    ).one()
    print(f"Found districtmap uuid: {districtr_map_uuid}")

    _add_extent_to_districtrmap(
        session=session, districtr_map_uuid=districtr_map_uuid, bounds=bounds
    )
    logger.info("Updated extent successfully.")


@cli.command("add-available-summary-stats-to-districtr-map")
@click.option("--districtr-map", "-d", help="Districtr map name", required=True)
@with_session
def add_available_summary_stats_to_districtr_map(session: Session, districtr_map: str):
    stmt = text(
        "SELECT uuid FROM districtrmap WHERE gerrydb_table_name = :districtrmap_name"
    )
    (districtr_map_uuid,) = session.execute(
        stmt, params={"districtrmap_name": districtr_map}
    ).one()
    print(f"Found districtmap uuid: {districtr_map_uuid}")

    _add_available_summary_stats_to_districtrmap(
        session=session, districtr_map_uuid=districtr_map_uuid
    )

    logger.info("Updated available summary stats successfully.")


@cli.command("batch-load-data")
@click.option("--config-file", "-c", help="Path to config file", required=True)
@click.option(
    "--data-dir",
    "-d",
    help="Path to data directory where the geopackages are located or will be downloaded to",
    default=GPKG_DATA_DIR,
)
@click.option(
    "--skip-gerrydb-loads",
    is_flag=True,
    help="Skip loading data into GerryDB",
)
def batch_load_data(config_file: str, data_dir: str, skip_gerrydb_loads: bool):
    logger.info(f"Loading data from {config_file}")

    config_path = get_local_or_s3_path(file_path=config_file)
    config = Config.from_file(file_path=config_path)

    logger.info("Loading sample data...")
    load_sample_data(
        config=config, data_dir=data_dir, skip_gerrydb_loads=skip_gerrydb_loads
    )

    logger.info("Successfully loaded new data")


if __name__ == "__main__":
    cli()
