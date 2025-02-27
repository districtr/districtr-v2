import subprocess
import sqlalchemy as sa
from pathlib import Path
from os import environ, path
import json

from app.utils import (
    create_parent_child_edges,
    create_districtr_map,
    create_shatterable_gerrydb_view,
)
from app.main import get_session
from app.core.config import settings
from cli import _import_gerrydb_view
from functools import wraps
import logging
from sqlmodel import Session
from app.models import DistrictrMapPublic, DistrictrMap
from pydantic import BaseModel
from app.contiguity import graph_from_gpkg, write_graph

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Optionally, set a data directory to load in
DATA_DIR = environ.get("GPKG_DATA_DIR", "sample_data")
CONFIG_FILE = environ.get("CONFIG_FILE", path.join(DATA_DIR, "config.json"))

# flag to load data, by default, will load data
LOAD_DATA = environ.get("LOAD_GERRY_DB_DATA", "false").lower() == "true"


def continue_on_previous_load(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (sa.exc.IntegrityError, sa.exc.ProgrammingError) as e:
            if "duplicate key value violates unique constraint" in str(e):
                logger.info(f"Unique constraint violation ignored: {e}")
            elif "Relationships for districtr_map" in str(e):
                logger.info(f"Relationships for districtr_map already exist: {e}")
            else:
                logger.error(f"Unexpected error: {e}")
                raise

    return wrapper


@continue_on_previous_load
def _create_shatterable_gerrydb_view(session: Session, **kwargs):
    create_shatterable_gerrydb_view(session=session, **kwargs)


@continue_on_previous_load
def _create_districtr_map(session: Session, **kwargs) -> str:
    return create_districtr_map(session=session, **kwargs)


@continue_on_previous_load
def _create_parent_child_edges(session: Session, **kwargs):
    create_parent_child_edges(session=session, **kwargs)


class GerryDBViewImport(BaseModel):
    gpkg: str
    layer: str


class ShatterableViewImport(BaseModel):
    gerrydb_table_name: str
    parent_layer_name: str
    child_layer_name: str


class Config(BaseModel):
    gerrydb_views: list[GerryDBViewImport]
    shatterable_views: list[ShatterableViewImport]
    districtr_maps: list[DistrictrMapPublic]


def load_sample_data(config: Config) -> None:
    """
    Load sample data from the specified data directory.

    This function iterates through all files with a '.gpkg' extension in the
    specified data directory, and for each file, it runs a script to load the
    GerryDB view.

    The order of adding views MUST be:
    - Add base gerrydb layer
    - Add shatterable view, if using shatterable layers
    - Add districtr map, which is the gerrydb view or the shatterable view
    - Add parent child edges, if using shatterable layers

    Args:
        config: Configuration dictionary
    """

    subprocess.run(["alembic", "upgrade", "head"])

    for view in config.gerrydb_views:
        session = next(get_session())
        gpkg = path.join(DATA_DIR, view.gpkg)

        if not Path(gpkg).exists():
            print(f"File {gpkg} does not exist.")
            gpkg = f"s3://{settings.AWS_S3_BUCKET}/gerrydb/{view.gpkg}"

        _import_gerrydb_view(session=session, layer=view.layer, gpkg=gpkg)

        session.commit()

        if "block" in view.layer:
            logger.info(f"Creating graph for {view.layer}")
            G = graph_from_gpkg(gpkg_path=gpkg)
            out_path = write_graph(G=G, gerrydb_name=view.layer)
            logger.info(f"Graph saved to {out_path}")

    for view in config.shatterable_views:
        session = next(get_session())
        _create_shatterable_gerrydb_view(session=session, **view.model_dump())
        session.commit()

    for view in config.districtr_maps:
        session = next(get_session())
        u = _create_districtr_map(
            session=session,
            name=view.name,
            gerrydb_table_name=view.gerrydb_table_name,
            parent_layer_name=view.parent_layer,
            child_layer_name=view.child_layer,
            tiles_s3_path=view.tiles_s3_path,
            num_districts=view.num_districts,
        )
        if u is not None:
            u = u[0]
            logger.info(f"Created districtr map with UUID {u}")
        else:
            session.rollback()
            session = next(get_session())
            u = session.exec(
                sa.select(DistrictrMap.uuid).where(  # pyright: ignore
                    DistrictrMap.gerrydb_table_name == view.gerrydb_table_name
                )
            ).scalar_one_or_none()
            logger.info(f"Found districtr map with UUID {u}")
            if u is None:
                raise ValueError(
                    f"Districtr map with gerrydb_table_name {view.gerrydb_table_name} not found"
                )

        if view.child_layer is not None:
            _create_parent_child_edges(session=session, districtr_map_uuid=str(u))

        session.commit()


if __name__ == "__main__":
    with open(CONFIG_FILE, "r") as config_file:
        data = json.load(config_file)
        config = Config(**data)

    if LOAD_DATA:
        logger.info("Loading sample data...")
        load_sample_data(config)
    else:
        logger.info(
            "App startup will not perform data loading.\nTo load, run `export LOAD_GERRY_DB_DATA='True' && python load_data.py`\nor change the environment variable in `docker-compose.yml`"
        )
