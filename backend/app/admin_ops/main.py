import logging
import re
from contextlib import nullcontext
from typing import Literal
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Security,
    status,
)
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine, get_session
from app.core.security import TokenScope, auth
from app.utils import (
    add_districtr_map_to_map_group,
    add_extent_to_districtrmap,
    create_districtr_map,
    create_parent_child_edges,
    create_shatterable_gerrydb_view,
)
from management.load_data import import_gerrydb_view

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

# The import code interpolates layer/table names into SQL identifiers and shell
# args, so restrict them to word characters before anything is scheduled.
SQL_IDENTIFIER_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")

# Slugs appear in URLs and (with '-' mapped to '_') in the shatterable view
# name, so keep them to lowercase letters, digits, and hyphens.
SLUG_PATTERN = re.compile(r"^[a-z0-9-]+$")


class GerryDBImportRequest(BaseModel):
    gpkg: str
    layer: str
    table_name: str | None = None
    rm: bool = False

    @field_validator("layer", "table_name")
    @classmethod
    def validate_sql_identifier(cls, value: str | None) -> str | None:
        if value is not None and not SQL_IDENTIFIER_PATTERN.fullmatch(value):
            raise ValueError("must contain only letters, numbers, and underscores")
        return value

    @field_validator("gpkg")
    @classmethod
    def validate_gpkg_extension(cls, value: str) -> str:
        if not urlparse(value).path.endswith(".gpkg"):
            raise ValueError("must be a path or URL to a .gpkg file")
        return value


def run_gerrydb_import(
    layer: str,
    gpkg: str,
    table_name: str | None = None,
    rm: bool = False,
    session: Session | None = None,
) -> None:
    """Run the GerryDB import, owning the DB session unless one is given.

    Background tasks must NOT receive the request-scoped session: it is closed
    at request teardown (see ``app.thumbnails.main.generate_thumbnail``).
    Called as a background task with ``session=None``, this opens and closes
    its own session. Tests may pass a session to share their transaction.
    """
    logger.info("Starting GerryDB import for layer %s from %s", layer, gpkg)
    try:
        # nullcontext leaves a caller-provided session open; an owned session
        # is closed on exit. import_gerrydb_view commits internally, so no
        # commit is needed here either way.
        ctx = nullcontext(session) if session is not None else Session(engine)
        with ctx as db_session:
            import_gerrydb_view(
                session=db_session, layer=layer, gpkg=gpkg, table_name=table_name, rm=rm
            )
    except Exception:
        logger.exception("GerryDB import failed for layer %s", layer)
        raise
    logger.info("GerryDB import succeeded for layer %s", layer)


@router.post("/gerrydb/import", status_code=status.HTTP_202_ACCEPTED)
async def schedule_gerrydb_import(
    *,
    data: GerryDBImportRequest,
    background_tasks: BackgroundTasks,
    auth_result: dict = Security(
        auth.verify, scopes=[TokenScope.create_districtr_maps]
    ),
):
    """Schedule a GeoPackage import into the gerrydb schema.

    Reuses the same code path as ``cli.py import-gerrydb-view`` but runs it as
    a background task so the CMS admin can trigger imports over HTTP.
    """
    background_tasks.add_task(
        run_gerrydb_import,
        layer=data.layer,
        gpkg=data.gpkg,
        table_name=data.table_name,
        rm=data.rm,
    )
    return {"status": "scheduled", "layer": data.layer}


class DistrictrMapComposeRequest(BaseModel):
    name: str
    districtr_map_slug: str
    parent_layer: str
    child_layer: str | None = None
    num_districts: int = Field(ge=1, le=200)
    tiles_s3_path: str | None = None
    group_slug: str | None = None
    map_type: Literal["default", "local", "community"] = "default"
    visible: bool = False

    @field_validator("districtr_map_slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not SLUG_PATTERN.fullmatch(value):
            raise ValueError(
                "must contain only lowercase letters, numbers, and hyphens"
            )
        return value

    @field_validator("parent_layer", "child_layer")
    @classmethod
    def validate_sql_identifier(cls, value: str | None) -> str | None:
        if value is not None and not SQL_IDENTIFIER_PATTERN.fullmatch(value):
            raise ValueError("must contain only letters, numbers, and underscores")
        return value


def shatterable_view_name(districtr_map_slug: str) -> str:
    """Name of the combined parent/child materialized view for a shatterable map.

    ``cli.py create-shatterable-districtr-view`` takes an arbitrary unique
    ``--gerrydb-table-name`` (batch configs conventionally use a name distinct
    from both source layers, e.g. ``ak_all_vap_elec``). Deriving it from the
    slug keeps it deterministic and unique (slugs are unique), and a valid SQL
    identifier: slugs match ``^[a-z0-9-]+$``, so replacing ``-`` with ``_``
    yields ``^[a-z0-9_]+$``.
    """
    return districtr_map_slug.replace("-", "_") + "_shatterable"


def _compose_districtr_map(
    session: Session,
    *,
    name: str,
    districtr_map_slug: str,
    parent_layer: str,
    child_layer: str | None,
    num_districts: int,
    tiles_s3_path: str | None,
    group_slug: str | None,
    map_type: str,
    visible: bool,
) -> None:
    """Run the compose steps in CLI order on the given session, without committing."""
    # For unshatterable maps the districtr map points straight at the parent
    # layer (cli.py create-districtr-map semantics); for shatterable maps it
    # points at the combined materialized view created below.
    gerrydb_table_name = parent_layer
    if child_layer is not None:
        gerrydb_table_name = shatterable_view_name(districtr_map_slug)
        logger.info(
            "Creating shatterable view %s for %s",
            gerrydb_table_name,
            districtr_map_slug,
        )
        create_shatterable_gerrydb_view(
            session=session,
            parent_layer=parent_layer,
            child_layer=child_layer,
            gerrydb_table_name=gerrydb_table_name,
        )

    logger.info("Creating districtr map %s", districtr_map_slug)
    districtr_map_uuid = create_districtr_map(
        session=session,
        name=name,
        districtr_map_slug=districtr_map_slug,
        parent_layer=parent_layer,
        child_layer=child_layer,
        gerrydb_table_name=gerrydb_table_name,
        num_districts=num_districts,
        tiles_s3_path=tiles_s3_path,
        map_type=map_type,
        # New modules stay hidden until reviewed unless explicitly requested.
        visibility=visible,
    )

    # cli.py create-districtr-map computes the extent (from the parent layer
    # when no bounds are given) right after the insert; mirror that here.
    logger.info("Adding extent for %s", districtr_map_slug)
    add_extent_to_districtrmap(session=session, districtr_map_uuid=districtr_map_uuid)

    if child_layer is not None:
        logger.info("Creating parent-child edges for %s", districtr_map_slug)
        create_parent_child_edges(
            session=session, districtr_map_uuid=districtr_map_uuid
        )

    if group_slug is not None:
        logger.info("Adding %s to map group %s", districtr_map_slug, group_slug)
        add_districtr_map_to_map_group(
            session=session,
            districtr_map_slug=districtr_map_slug,
            group_slug=group_slug,
            autocommit=False,
        )


def run_districtr_map_compose(
    *,
    name: str,
    districtr_map_slug: str,
    parent_layer: str,
    child_layer: str | None = None,
    num_districts: int,
    tiles_s3_path: str | None = None,
    group_slug: str | None = None,
    map_type: str = "default",
    visible: bool = False,
    session: Session | None = None,
) -> None:
    """Compose a DistrictrMap module, owning the DB session unless one is given.

    Chains the same steps as the CLI commands create-shatterable-districtr-view
    (when there is a child layer), create-districtr-map (including its default
    extent calculation), create-parent-child-edges, and
    add-districtr-map-to-map-group. Background tasks must NOT receive the
    request-scoped session (see ``run_gerrydb_import``); called with
    ``session=None`` this opens, commits, and closes its own session. Tests may
    pass a session to share their transaction.
    """
    logger.info("Starting districtr map compose for %s", districtr_map_slug)
    try:
        # nullcontext leaves a caller-provided session open (and uncommitted —
        # the caller owns the transaction); an owned session is committed here
        # and closed on exit.
        owns_session = session is None
        ctx = nullcontext(session) if session is not None else Session(engine)
        with ctx as db_session:
            _compose_districtr_map(
                db_session,
                name=name,
                districtr_map_slug=districtr_map_slug,
                parent_layer=parent_layer,
                child_layer=child_layer,
                num_districts=num_districts,
                tiles_s3_path=tiles_s3_path,
                group_slug=group_slug,
                map_type=map_type,
                visible=visible,
            )
            if owns_session:
                db_session.commit()
    except Exception:
        logger.exception("Districtr map compose failed for %s", districtr_map_slug)
        raise
    logger.info("Districtr map compose succeeded for %s", districtr_map_slug)


def _gerrydb_layer_exists(session: Session, layer: str) -> bool:
    return bool(
        session.execute(
            text("SELECT 1 FROM gerrydbtable WHERE name = :name LIMIT 1"),
            {"name": layer},
        ).scalar()
    )


@router.post("/districtr-map/compose", status_code=status.HTTP_202_ACCEPTED)
async def schedule_districtr_map_compose(
    *,
    data: DistrictrMapComposeRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    auth_result: dict = Security(
        auth.verify, scopes=[TokenScope.create_districtr_maps]
    ),
):
    """Compose a complete DistrictrMap module from existing gerrydb layers.

    Validates cheap preconditions in-request, then chains the same steps as
    the CLI commands (create-shatterable-districtr-view, create-districtr-map,
    create-parent-child-edges, add-districtr-map-to-map-group) as a background
    task so the CMS admin can compose map modules over HTTP.
    """
    for layer in (data.parent_layer, data.child_layer):
        if layer is not None and not _gerrydb_layer_exists(session, layer):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Gerrydb layer '{layer}' is not registered in gerrydbtable",
            )

    slug_exists = session.execute(
        text("SELECT 1 FROM districtrmap WHERE districtr_map_slug = :slug LIMIT 1"),
        {"slug": data.districtr_map_slug},
    ).scalar()
    if slug_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"DistrictrMap with slug '{data.districtr_map_slug}' already exists"
            ),
        )

    if data.group_slug is not None:
        group_exists = session.execute(
            text("SELECT 1 FROM map_group WHERE slug = :slug LIMIT 1"),
            {"slug": data.group_slug},
        ).scalar()
        if not group_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Map group '{data.group_slug}' does not exist",
            )

    background_tasks.add_task(
        run_districtr_map_compose,
        name=data.name,
        districtr_map_slug=data.districtr_map_slug,
        parent_layer=data.parent_layer,
        child_layer=data.child_layer,
        num_districts=data.num_districts,
        tiles_s3_path=data.tiles_s3_path,
        group_slug=data.group_slug,
        map_type=data.map_type,
        visible=data.visible,
    )
    return {"status": "scheduled", "districtr_map_slug": data.districtr_map_slug}
