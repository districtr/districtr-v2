import os
import sqlalchemy as sa
from pathlib import Path

from app.utils import (
    create_parent_child_edges,
    create_districtr_map,
    create_shatterable_gerrydb_view,
    get_local_or_s3_path,
    add_extent_to_districtrmap,
    add_available_summary_stats_to_districtrmap,
)
from app.main import get_session
from app.core.config import settings
from functools import wraps
import logging
from sqlmodel import Session
from app.models import DistrictrMapPublic, DistrictrMap
from pydantic import BaseModel
from app.constants import GERRY_DB_SCHEMA
import subprocess
import json
import yaml
from app.contiguity import graph_from_gpkg, write_graph

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def import_gerrydb_view(
    session: Session,
    layer: str,
    gpkg: str,
    rm: bool = False,
    table_name: str | None = None,
):
    logger.info("Importing GerryDB view...")

    path = get_local_or_s3_path(gpkg)

    if table_name is None:
        table_name = layer

    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            f"PG:host={settings.POSTGRES_SERVER} port={settings.POSTGRES_PORT} dbname={settings.POSTGRES_DB} user={settings.POSTGRES_USER} password={settings.POSTGRES_PASSWORD}",
            path,
            layer,  # must match layer name in gpkg
            "-lco",
            "OVERWRITE=yes",
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nlt",
            "MULTIPOLYGON",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{table_name}",
        ],
    )

    if result.returncode != 0:
        logger.error("ogr2ogr failed. Got %s", result)
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

    logger.info("GerryDB view imported successfully")

    if rm:
        os.remove(path)
        logger.info("Deleted file %s", path)

    logger.info("GerryDB view imported successfully")

    upsert_query = sa.text(
        """
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """
    )

    session.execute(
        upsert_query,
        {
            "name": table_name,
        },
    )
    logger.info("GerryDB view upserted successfully.")


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
    table_name: str | None = None


class ShatterableViewImport(BaseModel):
    gerrydb_table_name: str
    parent_layer: str
    child_layer: str


def get_filetype(file_path: str) -> str:
    _, ext = os.path.splitext(file_path)
    return ext.lower()


class Config(BaseModel):
    gerrydb_views: list[GerryDBViewImport]
    shatterable_views: list[ShatterableViewImport]
    districtr_maps: list[DistrictrMapPublic]

    @classmethod
    def from_file(cls, file_path: str) -> "Config":
        """
        Load configuration from a file. Supports JSON and YAML formats.

        Args:
            file_path: Path to the configuration file.
        Returns:
            Config object.
        Raises:
            ValueError: If the file type is not supported.
        """
        file_type = get_filetype(file_path)
        if file_type == ".json":
            with open(file_path, "r") as f:
                data = json.load(f)
        elif file_type in (".yaml", ".yml"):
            with open(file_path, "r") as f:
                data = yaml.safe_load(f)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        return cls(**data)


def load_sample_data(
    config: Config, data_dir: str, skip_gerrydb_loads: bool = False
) -> None:
    """
    Load sample data from the specified data directory.

    This function iterates through all files with a '.gpkg' extension in the
    specified data directory, and for each file, it runs a script to load the
    GerryDB view.

    The order of adding views MUST be:
    1. Add base gerrydb layer(s)
    2. Add shatterable view, if using shatterable layers
    3. Add districtr map, which is the gerrydb view or the shatterable view
    4. Add parent child edges, if using shatterable layers

    Args:
        config: Configuration dictionary
        data_dir: Volume path
        skip_gerrydb_loads: Whether to skip loading GerryDB views
    """
    for view in config.gerrydb_views:
        if skip_gerrydb_loads:
            continue

        session = next(get_session())
        gpkg = os.path.join(data_dir, view.gpkg)

        if not Path(gpkg).exists():
            print(f"File {gpkg} does not exist.")
            gpkg = f"s3://{settings.R2_BUCKET_NAME}/gerrydb/{view.gpkg}"

        import_gerrydb_view(
            session=session, layer=view.layer, gpkg=gpkg, table_name=view.table_name
        )

        session.commit()

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
            parent_layer=view.parent_layer,
            child_layer=view.child_layer,
            tiles_s3_path=view.tiles_s3_path,
            num_districts=view.num_districts,
        )

        if u is not None:
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

        logger.info(f"Adding extent to districtr map with UUID {u}")
        add_extent_to_districtrmap(session=session, districtr_map_uuid=u)

        logger.info(f"Adding available summary stats to districtr map with UUID {u}")
        _ = add_available_summary_stats_to_districtrmap(
            session=session, districtr_map_uuid=u
        )

        if view.child_layer is not None:
            _create_parent_child_edges(session=session, districtr_map_uuid=str(u))

        session.commit()
