import click
import logging
import re

from app.core.db import engine
from app.core.config import settings
from sqlalchemy import text
from app.utils import (
    create_districtr_map as _create_districtr_map,
    create_map_group as _create_map_group,
    create_shatterable_gerrydb_view as _create_shatterable_gerrydb_view,
    create_parent_child_edges as _create_parent_child_edges,
    add_extent_to_districtrmap as _add_extent_to_districtrmap,
    add_districtr_map_to_map_group as _add_districtr_map_to_map_group,
    update_districtrmap as _update_districtrmap,
    create_spatial_index as _create_spatial_index,
)
from app.core.io import get_local_or_s3_path
from app.constants import GERRY_DB_SCHEMA
from app.contiguity.main import write_graph, graph_from_gpkg, GraphFileFormat
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
def import_gerrydb_view(session: Session, layer: str, gpkg: str, rm: bool):
    _import_gerrydb_view(
        session=session,
        layer=layer,
        gpkg=gpkg,
        rm=rm,
    )


@cli.command("create-parent-child-edges")
@click.option("--districtr-map-slug", "-d", help="Districtr map slug", required=True)
@with_session
def create_parent_child_edges(session: Session, districtr_map_slug: str):
    logger.info("Creating parent-child edges...")

    stmt = text(
        "SELECT uuid FROM districtrmap WHERE districtr_map_slug = :districtr_map_slug"
    )
    (districtr_map_uuid,) = session.execute(
        stmt, params={"districtr_map_slug": districtr_map_slug}
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
@click.option("--districtr-map-slug", help="Slug of the districtr map", required=True)
@click.option("--child-layer-name", help="Child gerrydb layer name", required=False)
@click.option("--group-slug", help="Map group slug", type=str, required=False)
@click.option("--map-type", help="Map UI type", type=str, required=False)
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
    parent_layer_name: str,
    districtr_map_slug: str,
    child_layer_name: str | None,
    gerrydb_table_name: str,
    num_districts: int | None,
    tiles_s3_path: str | None,
    no_extent: bool = False,
    bounds: list[float] | None = None,
    group_slug: str = "states",
    map_type: str = "default",
):
    logger.info("Creating districtr map...")
    districtr_map_uuid = _create_districtr_map(
        session=session,
        name=name,
        parent_layer=parent_layer_name,
        child_layer=child_layer_name,
        districtr_map_slug=districtr_map_slug,
        group_slug=group_slug,
        map_type=map_type,
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
@click.option("--map-type", help="Map UI type", type=str, required=False)
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
    districtr_map_slug: str,
    gerrydb_table_name: str | None,
    name: str | None,
    parent_layer_name: str | None,
    child_layer_name: str | None,
    num_districts: int | None,
    tiles_s3_path: str | None,
    visibility: bool = False,
    bounds: list[float] | None = None,
    map_type: str | None = None,
):
    logger.info("Updating districtr map...")

    _bounds = None
    if bounds and len(bounds) == 4:
        _bounds = bounds

    result = _update_districtrmap(
        session=session,
        districtr_map_slug=districtr_map_slug,
        gerrydb_table_name=gerrydb_table_name,
        name=name,
        parent_layer=parent_layer_name,
        child_layer=child_layer_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
        visible=visibility,
        map_type=map_type,
        bounds=_bounds,
    )
    logger.info(f"Districtr map updated successfully {result}")


@cli.command("create-gerrydb-graph")
@click.option("--gpkg", "-g", help="Path or URL to GeoPackage file", required=True)
@click.option("--gerrydb-name", help="Name of the GerryDB table", required=False)
@click.option(
    "--graph-file-format",
    help="Graph file format to exports. Supports gml and pkl",
    required=False,
    type=GraphFileFormat,
    default=GraphFileFormat.pkl,
)
@click.option(
    "--skip-upload",
    help="Whether to upload to S3",
    required=False,
    default=False,
    type=bool,
    is_flag=True,
)
def create_gerrydb_graph(
    gpkg: str,
    gerrydb_name: str,
    graph_file_format: GraphFileFormat,
    skip_upload: bool,
):
    logger.info("Creating gerrydb graph GML...")
    G = graph_from_gpkg(gpkg)
    out_path_local = write_graph(
        G=G,
        gerrydb_name=gerrydb_name,
        upload_to_s3=not skip_upload,
        graph_file_format=graph_file_format,
    )
    logger.info(f"Graph file written to {out_path_local}")


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
@click.option("--districtr-map-slug", "-d", help="Districtr map slug", required=True)
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
    session: Session, districtr_map_slug: str, bounds: list[float] | None = None
):
    logger.info(f"User provided bounds: {bounds}")

    stmt = text(
        "SELECT uuid FROM districtrmap WHERE districtr_map_slug = :districtr_map_slug"
    )
    (districtr_map_uuid,) = session.execute(
        stmt, params={"districtr_map_slug": districtr_map_slug}
    ).one()
    print(f"Found districtmap uuid: {districtr_map_uuid}")

    _add_extent_to_districtrmap(
        session=session, districtr_map_uuid=districtr_map_uuid, bounds=bounds
    )
    logger.info("Updated extent successfully.")


@cli.command("batch-create-districtr-maps")
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
def batch_create_districtr_maps(
    config_file: str, data_dir: str, skip_gerrydb_loads: bool
):
    logger.info(f"Loading data from {config_file}")

    config_path = get_local_or_s3_path(file_path=config_file)
    config = Config.from_file(file_path=config_path)

    logger.info("Loading sample data...")
    load_sample_data(
        config=config, data_dir=data_dir, skip_gerrydb_loads=skip_gerrydb_loads
    )

    logger.info("Successfully loaded new data")


@cli.command("create-spatial-index")
@click.option("--table-name", "-t", help="Table name", required=True, multiple=True)
@click.option(
    "--schema", "-s", help="Schema name", required=False, default=GERRY_DB_SCHEMA
)
@click.option(
    "--geometry-column",
    "-g",
    help="Geometry column name",
    required=False,
    default="geometry",
)
@with_session
def create_spatial_index(
    session: Session, table_name: list[str], schema: str, geometry_column: str
):
    for table in table_name:
        _create_spatial_index(
            session=session,
            table_name=table,
            schema=schema,
            geometry=geometry_column,
            autocommit=True,
        )
        logger.info(f"Created spatial index successfully for table {table}.")


@cli.command("create-group")
@click.option("--name", "-n", help="Group name", required=True)
@click.option("--map-group-slug", "-s", help="Group slug", required=False)
@with_session
def create_map_group(session: Session, name: str, map_group_slug: str | None):
    # generate slug as lowercase a-z, no spaces
    if map_group_slug is None:
        map_group_slug = "".join(re.findall(r"[a-z]", name.lower()))

    _create_map_group(
        session=session,
        group_name=name,
        slug=map_group_slug,
        autocommit=True,
    )
    logger.info(f"Created map group named {name} and slug `{map_group_slug}`.")


@cli.command("add-districtr-map-to-map-group")
@click.option("--districtr-map-slug", "-d", help="DistrictrMap slug", required=True)
@click.option("--map-group-slug", "-s", help="Group slug", required=True)
@with_session
def add_districtr_map_to_map_group(
    session: Session, districtr_map_slug: str, map_group_slug: str
):
    _add_districtr_map_to_map_group(
        session=session,
        districtr_map_slug=districtr_map_slug,
        group_slug=map_group_slug,
        autocommit=True,
    )
    logger.info(f"Added {districtr_map_slug} to `{map_group_slug}`.")


if __name__ == "__main__":
    cli()
