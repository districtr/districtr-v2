import logging
import re
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Security, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session

from app.core.db import engine
from app.core.security import TokenScope, auth
from management.load_data import import_gerrydb_view

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

# The import code interpolates layer/table names into SQL identifiers and shell
# args, so restrict them to word characters before anything is scheduled.
SQL_IDENTIFIER_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


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
        if session is not None:
            import_gerrydb_view(
                session=session, layer=layer, gpkg=gpkg, table_name=table_name, rm=rm
            )
        else:
            with Session(engine) as owned_session:
                import_gerrydb_view(
                    session=owned_session,
                    layer=layer,
                    gpkg=gpkg,
                    table_name=table_name,
                    rm=rm,
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
