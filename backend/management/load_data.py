import os
import sqlalchemy as sa
from pathlib import Path

from app.utils import (
    create_parent_child_edges,
    create_districtr_map,
    create_shatterable_gerrydb_view,
    add_extent_to_districtrmap,
    create_spatial_index,
    add_districtr_map_to_map_group,
    create_map_group,
)
from app.core.io import get_local_or_s3_path
from app.main import get_session
from app.core.config import settings
from functools import wraps
import logging
from sqlmodel import Session, select
from app.models import DistrictrMapPublic, DistrictrMap, ConfigMapGroup
from pydantic import BaseModel, computed_field
from app.constants import GERRY_DB_SCHEMA
import subprocess
import json
import yaml

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
            "OVERWRITE=no",  # overwriting drops materialized views
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

    # Commit before trying to build index
    session.commit()
    logger.info(f"GerryDB view {table_name} imported successfully")

    if rm:
        os.remove(path)
        logger.info("Deleted file %s", path)

    logger.info(f"GerryDB view {table_name} imported successfully")

    logger.info("Creating index")
    create_spatial_index(session, table_name=table_name)
    logger.info("Index created successfully")

    session.commit()

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
    # Spatial join over large states can exceed the default 120s API timeout.
    session.execute(sa.text("SET statement_timeout = '0'"))

    # If another map with the same parent/child layers already has edges, copy
    # from that partition instead of re-running the expensive spatial join.
    # A geography's map modules (congressional/senate/house/custom) share one
    # layer pair, so their edge sets are identical.
    districtr_map_uuid = kwargs["districtr_map_uuid"]
    map_row = session.exec(
        select(DistrictrMap).where(DistrictrMap.uuid == districtr_map_uuid)
    ).one_or_none()

    if map_row and map_row.child_layer:
        existing = session.execute(
            sa.text("""
                SELECT dm.uuid
                FROM districtrmap dm
                WHERE dm.parent_layer = :parent_layer
                  AND dm.child_layer  = :child_layer
                  AND dm.uuid        != :uuid
                  AND EXISTS (
                      SELECT 1 FROM parentchildedges pce
                      WHERE pce.districtr_map = dm.uuid
                  )
                LIMIT 1
            """),
            {
                "parent_layer": map_row.parent_layer,
                "child_layer": map_row.child_layer,
                "uuid": str(districtr_map_uuid),
            },
        ).one_or_none()

        if existing:
            uuid_str = str(districtr_map_uuid)
            partition_name = f"parentchildedges_{uuid_str}"
            # Name the source partition directly to bypass partition pruning on the
            # parameterized query — without this, PostgreSQL scans all partitions.
            source_partition_name = f"parentchildedges_{existing.uuid}"
            partition_exists = session.execute(
                sa.text(
                    "SELECT 1 FROM pg_tables"
                    " WHERE schemaname = 'public' AND tablename = :name"
                ),
                {"name": partition_name},
            ).scalar()
            if not partition_exists:
                session.execute(
                    sa.text(
                        f'CREATE TABLE "{partition_name}" '
                        f"PARTITION OF parentchildedges FOR VALUES IN ('{uuid_str}')"
                    )
                )
            session.execute(
                sa.text(f"""
                    INSERT INTO "{partition_name}" (created_at, districtr_map, parent_path, child_path)
                    SELECT now(), '{uuid_str}', parent_path, child_path
                    FROM "{source_partition_name}"
                """),
            )
            logger.info(
                "Copied parent-child edges from %s to %s", existing.uuid, uuid_str
            )
            return

    create_parent_child_edges(session=session, **kwargs)


class GerryDBViewImport(BaseModel):
    gpkg: str
    layer: str
    table_name: str | None = None

    @computed_field
    @property
    def _table_name(self) -> str:
        return self.table_name or self.layer


class ShatterableViewImport(BaseModel):
    gerrydb_table_name: str
    parent_layer: str
    child_layer: str


class MapGroupDefinition(BaseModel):
    """Display name for a map group, keyed by slug.

    Groups referenced by `map_groups` entries are created automatically if
    absent; this section supplies the human-facing name (e.g. slug `custom`
    -> name "Custom Districts"). Groups without a definition fall back to a
    title-cased slug.
    """

    slug: str
    name: str


def get_filetype(file_path: str) -> str:
    _, ext = os.path.splitext(file_path)
    return ext.lower()


class Config(BaseModel):
    gerrydb_views: list[GerryDBViewImport] | None = None
    shatterable_views: list[ShatterableViewImport] | None = None
    districtr_maps: list[DistrictrMapPublic] | None = None
    map_groups: list[ConfigMapGroup] | None = None
    map_group_definitions: list[MapGroupDefinition] | None = None

    @computed_field
    @property
    def _gerrydb_views(self) -> list[GerryDBViewImport]:
        return self.gerrydb_views or []

    @computed_field
    @property
    def _shatterable_views(self) -> list[ShatterableViewImport]:
        return self.shatterable_views or []

    @computed_field
    @property
    def _districtr_maps(self) -> list[DistrictrMapPublic]:
        return self.districtr_maps or []

    @computed_field
    @property
    def _map_groups(self) -> list[ConfigMapGroup]:
        return self.map_groups or []

    @computed_field
    @property
    def _map_group_definitions(self) -> list[MapGroupDefinition]:
        return self.map_group_definitions or []

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
    config: Config,
    data_dir: str,
    skip_gerrydb_loads: bool = False,
    visibility_override: bool | None = None,
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
    for view in config._gerrydb_views:
        if skip_gerrydb_loads:
            continue

        session = next(get_session())
        gpkg = os.path.join(data_dir, view.gpkg)

        if not Path(gpkg).exists():
            logger.info(f"File {gpkg} does not exist.")
            gpkg = f"s3://{settings.R2_BUCKET_NAME}/gerrydb/{view.gpkg}"

        try:
            table_exists = session.execute(
                sa.text(f"select 1 from gerrydb.{view._table_name} limit 1")
            ).scalar()
        except sa.exc.ProgrammingError:
            table_exists = False
            session.rollback()

        if table_exists:
            logger.info(f"GerryDB view {view.table_name} already exists.")
        else:
            import_gerrydb_view(
                session=session,
                layer=view.layer,
                gpkg=gpkg,
                table_name=view._table_name,
            )

        session.commit()

    for view in config._shatterable_views:
        session = next(get_session())
        gerrydb_table_exists = session.execute(
            sa.text("select 1 from gerrydbtable where name = :name limit 1"),
            {"name": view.gerrydb_table_name},
        ).scalar()
        session.rollback()
        if gerrydb_table_exists:
            logger.info(f"GerryDB table {view.gerrydb_table_name} already exists.")
        else:
            _create_shatterable_gerrydb_view(session=session, **view.model_dump())
            session.commit()

    for view in config._districtr_maps:
        session = next(get_session())
        districtr_map_exists = session.execute(
            sa.text(
                "select uuid from districtrmap where districtr_map_slug = :slug limit 1"
            ),
            {"slug": view.districtr_map_slug},
        ).one_or_none()
        session.rollback()
        if districtr_map_exists:
            u = districtr_map_exists.uuid
            logger.info(f"Districtr map {view.districtr_map_slug} already exists.")
        else:
            u = _create_districtr_map(
                session=session,
                name=view.name,
                districtr_map_slug=view.districtr_map_slug,
                gerrydb_table_name=view.gerrydb_table_name,
                parent_layer=view.parent_layer,
                child_layer=view.child_layer,
                tiles_s3_path=view.tiles_s3_path,
                num_districts=view.num_districts,
                num_districts_modifiable=view.num_districts_modifiable,
                visibility=(
                    visibility_override
                    if visibility_override is not None
                    else view.visible
                ),
            )
            logger.info(f"Adding extent to districtr map with UUID {u}")
            add_extent_to_districtrmap(session=session, districtr_map_uuid=u)
            session.commit()

        if u is None:
            session = next(get_session())
            u = session.exec(
                sa.select(DistrictrMap.uuid).where(  # pyright: ignore
                    DistrictrMap.districtr_map_slug == view.districtr_map_slug
                )
            ).scalar_one_or_none()
            logger.info(f"Found districtr map with UUID {u}")
            if u is None:
                raise ValueError(
                    f"Districtr map with districtr_map_slug {view.districtr_map_slug} not found"
                )
        else:
            logger.info(f"Created districtr map with UUID {u}")

        if view.child_layer is not None:
            edges_exist = session.execute(
                sa.text(
                    "SELECT COUNT(*) > 0 FROM parentchildedges WHERE districtr_map = :uuid"
                ),
                {"uuid": u},
            ).scalar()
            if edges_exist:
                logger.info(
                    f"Parent-child edges for {view.districtr_map_slug} already exist, skipping."
                )
            else:
                session.commit()
                _create_parent_child_edges(session=session, districtr_map_uuid=u)

        session.commit()

    # Ensure every group referenced by map_groups exists before adding
    # memberships (check-before-create, idempotent across re-runs).
    group_names = {d.slug: d.name for d in config._map_group_definitions}
    referenced_slugs = sorted({g.group_slug for g in config._map_groups})
    for slug in referenced_slugs:
        session = next(get_session())
        group_exists = session.execute(
            sa.text("select 1 from map_group where slug = :slug limit 1"),
            {"slug": slug},
        ).scalar()
        session.rollback()
        if group_exists:
            logger.info(f"Map group `{slug}` already exists.")
            continue
        name = group_names.get(slug, slug.replace("_", " ").replace("-", " ").title())
        create_map_group(session=session, group_name=name, slug=slug)
        logger.info(f"Created map group `{slug}` ({name}).")

    for group in config._map_groups:
        session = next(get_session())
        add_districtr_map_to_map_group(
            session=session,
            districtr_map_slug=group.districtr_map_slug,
            group_slug=group.group_slug,
        )
        session.commit()
