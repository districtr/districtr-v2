"""Add columns to an onboarded GerryDB layer and refresh everything derived from it.

The three steps run in this order for each layer pair of a shatterable view:

1. `add_gerrydb_columns` on the parent and the child table.
2. `rebuild_shatterable_view` on the view that unions them.
3. `invalidate_document_caches` on the same view, so documents recompute
   their cached stats and evaluations on next read.

Values already in a GerryDB table change only in columns named explicitly
with `replace=True`.
"""

import logging
import re
from dataclasses import dataclass
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy import delete, update
from sqlmodel import Session, col, func, select

from app.constants import GERRY_DB_SCHEMA
from app.core.io import get_local_or_s3_path
from app.evaluation.models import CountyDemographics, Evaluation
from app.models import DistrictrMap, DistrictUnions, Document
from app.utils import _quote_ident, assert_safe_ident, get_gerrydb_numeric_cols
from management.load_data import ogr2ogr_to_gerrydb

logger = logging.getLogger(__name__)

STAGING_TABLE_PREFIX = "_add_columns_staging_"
REBUILD_PREFIX = "_rebuild_"

# Columns ogr2ogr adds or that identify a row; never candidates for adding.
_RESERVED_COLUMNS = {"ogc_fid", "path", "geometry"}
# format_type() output for the column types ogr2ogr writes.
_SAFE_TYPE_RE = re.compile(r"^[a-z0-9 _(),]+$")
# pg_get_indexdef() output: CREATE [UNIQUE] INDEX <name> ON <table> <rest>.
_INDEXDEF_RE = re.compile(r"^CREATE (UNIQUE )?INDEX (\S+) ON (\S+) (.+)$", re.DOTALL)
# How long an exclusive lock on a live table or view waits for its current
# readers before the command gives up and rolls back; a re-run is safe.
LOCK_TIMEOUT = "10s"


def _relkind(session: Session, name: str) -> str | None:
    return session.execute(
        sa.text(
            "SELECT c.relkind FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema AND c.relname = :name"
        ),
        {"schema": GERRY_DB_SCHEMA, "name": name},
    ).scalar_one_or_none()


def _column_types(session: Session, relation: str) -> dict[str, str]:
    """Column name -> SQL type for a gerrydb relation, in column order."""
    rows = session.execute(
        sa.text(
            """
            SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = :schema
              AND c.relname = :name
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
            """
        ),
        {"schema": GERRY_DB_SCHEMA, "name": relation},
    ).all()
    return {name: type_ for name, type_ in rows}


def _drop_table_autocommit(session: Session, table: str) -> None:
    """Drop a table on a fresh connection, independent of the session's transaction."""
    engine = session.get_bind().engine
    with engine.begin() as conn:
        conn.execute(sa.text(f'DROP TABLE IF EXISTS {GERRY_DB_SCHEMA}."{table}"'))


def _drop_columns_autocommit(session: Session, table: str, columns: list[str]) -> None:
    """Drop columns on a fresh connection, independent of the session's transaction."""
    if not columns:
        return
    engine = session.get_bind().engine
    drops = ", ".join(f"DROP COLUMN IF EXISTS {_quote_ident(c)}" for c in columns)
    with engine.begin() as conn:
        conn.execute(sa.text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
        conn.execute(sa.text(f"ALTER TABLE {GERRY_DB_SCHEMA}.{table} {drops}"))


@dataclass
class AddColumnsResult:
    added: list[str]
    replaced: list[str]
    rows_updated: int


def add_gerrydb_columns(
    session: Session,
    table: str,
    gpkg: str,
    layer: str | None = None,
    columns: list[str] | None = None,
    replace: bool = False,
) -> AddColumnsResult:
    """Add GeoPackage columns to an existing `gerrydb.<table>`, matched on `path`.

    The GeoPackage layer is loaded into a staging table, then one transaction
    adds the columns and fills them with `UPDATE ... FROM` the staging table.
    By default the columns are every numeric GeoPackage column the table
    lacks. A named column that already exists is refused unless `replace`,
    in which case its values are overwritten.

    Every staging `path` must match a table row and every table row must
    match a staging `path`; any mismatch aborts with nothing changed. New
    columns are committed before the UPDATE, and dropped again if the UPDATE
    fails. The caller commits the UPDATE.
    """
    assert_safe_ident(table)
    if replace and not columns:
        raise ValueError("--replace requires --columns naming the columns to overwrite")
    if _relkind(session, table) != "r":
        raise ValueError(f"{GERRY_DB_SCHEMA}.{table} is not an existing table")

    staging = f"{STAGING_TABLE_PREFIX}{uuid4().hex[:16]}"
    path = get_local_or_s3_path(gpkg, replace=True)
    logger.info("Loading %s into staging table %s", gpkg, staging)
    try:
        ogr2ogr_to_gerrydb(
            path=path,
            layer=layer or table,
            table_name=staging,
            overwrite=True,
            with_geometry=False,
        )
    except Exception:
        _drop_table_autocommit(session, staging)
        raise

    # Validation runs inside a savepoint: rolling it back releases the locks
    # it took, so the failure path can drop the staging table from another
    # connection.
    savepoint = session.begin_nested()
    try:
        selected, added, staging_types = _select_columns(
            session, table, staging, columns, replace
        )
        savepoint.commit()
    except Exception:
        savepoint.rollback()
        _drop_table_autocommit(session, staging)
        raise

    # Adding a nullable column is instant but needs an exclusive lock, which
    # would block every reader of the table until the UPDATE finished. It is
    # committed on its own; the new columns stay invisible to requests until
    # the shatterable view is rebuilt, because stats read the view.
    if added:
        clauses = []
        for name in added:
            type_ = staging_types[name]
            if not _SAFE_TYPE_RE.match(type_):
                _drop_table_autocommit(session, staging)
                raise ValueError(f"Unexpected type {type_!r} for column {name}")
            clauses.append(f"ADD COLUMN {_quote_ident(name)} {type_}")
        try:
            session.execute(sa.text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
            session.execute(
                sa.text(f"ALTER TABLE {GERRY_DB_SCHEMA}.{table} {', '.join(clauses)}")
            )
            session.commit()
        except Exception:
            session.rollback()
            _drop_table_autocommit(session, staging)
            raise

    try:
        session.execute(sa.text("SET LOCAL statement_timeout = '0'"))
        assignments = ", ".join(
            f"{_quote_ident(name)} = s.{_quote_ident(name)}" for name in selected
        )
        rows_updated = session.execute(
            sa.text(
                f"UPDATE {GERRY_DB_SCHEMA}.{table} AS t SET {assignments} "
                f'FROM {GERRY_DB_SCHEMA}."{staging}" AS s WHERE t.path = s.path'
            )
        ).rowcount
        session.execute(sa.text(f'DROP TABLE {GERRY_DB_SCHEMA}."{staging}"'))
    except Exception:
        session.rollback()
        _drop_columns_autocommit(session, table, added)
        _drop_table_autocommit(session, staging)
        raise

    replaced = [c for c in selected if c not in added]
    logger.info(
        "Updated %s rows of %s.%s (added %s, replaced %s)",
        rows_updated,
        GERRY_DB_SCHEMA,
        table,
        added,
        replaced,
    )
    return AddColumnsResult(added=added, replaced=replaced, rows_updated=rows_updated)


def _select_columns(
    session: Session,
    table: str,
    staging: str,
    columns: list[str] | None,
    replace: bool,
) -> tuple[list[str], list[str], dict[str, str]]:
    """Validate the staged layer against the table; return the columns to write."""
    session.execute(sa.text("SET LOCAL statement_timeout = '0'"))

    staging_types = _column_types(session, staging)
    table_types = _column_types(session, table)
    if "path" not in staging_types:
        raise ValueError("The GeoPackage layer has no `path` column")

    if columns:
        for name in columns:
            assert_safe_ident(name)
        unknown = [c for c in columns if c not in staging_types]
        if unknown:
            raise ValueError(f"Columns missing from the GeoPackage: {unknown}")
        reserved = [c for c in columns if c in _RESERVED_COLUMNS]
        if reserved:
            raise ValueError(f"Reserved columns cannot be added: {reserved}")
        existing = [c for c in columns if c in table_types]
        if existing and not replace:
            raise ValueError(
                f"Columns already exist in {GERRY_DB_SCHEMA}.{table}: {existing}. "
                "Pass --replace to overwrite them."
            )
        selected = list(columns)
    else:
        selected = [
            c
            for c in get_gerrydb_numeric_cols(session, staging)
            if c not in _RESERVED_COLUMNS and c not in table_types
        ]
        if not selected:
            raise ValueError(
                f"Every numeric GeoPackage column already exists in "
                f"{GERRY_DB_SCHEMA}.{table}. Name columns with --columns and "
                "pass --replace to overwrite them."
            )

    counts = session.execute(
        sa.text(
            f"""
            SELECT
                (SELECT count(*) FROM {GERRY_DB_SCHEMA}."{staging}") AS staging_rows,
                (SELECT count(DISTINCT path) FROM {GERRY_DB_SCHEMA}."{staging}")
                    AS staging_paths,
                (SELECT count(*) FROM {GERRY_DB_SCHEMA}."{staging}" s
                 WHERE NOT EXISTS (
                     SELECT 1 FROM {GERRY_DB_SCHEMA}.{table} t WHERE t.path = s.path
                 )) AS staging_only,
                (SELECT count(*) FROM {GERRY_DB_SCHEMA}.{table} t
                 WHERE NOT EXISTS (
                     SELECT 1 FROM {GERRY_DB_SCHEMA}."{staging}" s WHERE s.path = t.path
                 )) AS table_only
            """
        )
    ).one()
    if counts.staging_rows != counts.staging_paths:
        raise ValueError(
            f"The GeoPackage repeats paths: {counts.staging_rows} rows, "
            f"{counts.staging_paths} distinct paths"
        )
    if counts.staging_only or counts.table_only:
        raise ValueError(
            f"Paths differ between the GeoPackage and {GERRY_DB_SCHEMA}.{table}: "
            f"{counts.staging_only} GeoPackage paths are missing from the table, "
            f"{counts.table_only} table paths are missing from the GeoPackage"
        )

    added = [c for c in selected if c not in table_types]
    return selected, added, staging_types


@dataclass
class RebuildViewResult:
    parent_layer: str
    child_layer: str
    columns: list[str]
    rows_before: int
    rows_after: int
    indexes: list[str]


def _view_columns(session: Session, table: str) -> list[str]:
    """Columns a shatterable view carries from `table`: all but geometry and ogc_fid."""
    rows = session.execute(
        sa.text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = :schema
              AND table_name = :name
              AND data_type != 'USER-DEFINED'
              AND udt_name != 'geometry'
              AND column_name != 'ogc_fid'
            ORDER BY ordinal_position
            """
        ),
        {"schema": GERRY_DB_SCHEMA, "name": table},
    ).all()
    return [row[0] for row in rows]


def rebuild_shatterable_view(
    session: Session, gerrydb_table_name: str
) -> RebuildViewResult:
    """Recreate the shatterable materialized view with its layers' current columns.

    The replacement is built under a temporary name with copies of the old
    view's indexes, then the old view is dropped and the new one renamed into
    place. Everything runs in the caller's transaction, so readers see the
    old view until commit and the new one after. The `gerrydbtable` row is
    left as is. The parent and child layers come from the districtr maps
    whose `gerrydb_table_name` is this view.
    """
    view = assert_safe_ident(gerrydb_table_name)
    if _relkind(session, view) != "m":
        raise ValueError(f"{GERRY_DB_SCHEMA}.{view} is not a materialized view")

    layer_pairs = session.exec(
        select(DistrictrMap.parent_layer, DistrictrMap.child_layer)
        .where(DistrictrMap.gerrydb_table_name == view)
        .distinct()
    ).all()
    if len(layer_pairs) != 1 or layer_pairs[0][1] is None:
        raise ValueError(
            f"Expected one parent/child layer pair among the districtr maps on "
            f"{view}, found {[tuple(p) for p in layer_pairs]}"
        )
    parent = assert_safe_ident(layer_pairs[0][0])
    child = assert_safe_ident(layer_pairs[0][1])

    view_columns = _view_columns(session, parent)
    missing = sorted(set(view_columns) - set(_view_columns(session, child)))
    if missing:
        raise ValueError(f"Child layer {child} lacks parent columns: {missing}")

    indexes = session.execute(
        sa.text(
            "SELECT indexname, indexdef FROM pg_indexes "
            "WHERE schemaname = :schema AND tablename = :name ORDER BY indexname"
        ),
        {"schema": GERRY_DB_SCHEMA, "name": view},
    ).all()

    session.execute(sa.text("SET LOCAL statement_timeout = '0'"))
    rows_before = session.execute(
        sa.text(f"SELECT count(*) FROM {GERRY_DB_SCHEMA}.{view}")
    ).scalar_one()

    suffix = uuid4().hex[:16]
    temp_view = f"{REBUILD_PREFIX}{suffix}"
    column_sql = ", ".join(_quote_ident(c) for c in view_columns)
    session.execute(
        sa.text(
            f"CREATE MATERIALIZED VIEW {GERRY_DB_SCHEMA}.{temp_view} AS "
            f"SELECT {column_sql} FROM {GERRY_DB_SCHEMA}.{parent} "
            f"UNION ALL "
            f"SELECT {column_sql} FROM {GERRY_DB_SCHEMA}.{child}"
        )
    )

    index_renames: list[tuple[str, str]] = []
    for i, (index_name, indexdef) in enumerate(indexes):
        match = _INDEXDEF_RE.match(indexdef)
        if match is None:
            raise ValueError(f"Unrecognized index definition: {indexdef}")
        unique, _, _, rest = match.groups()
        temp_index = f"{REBUILD_PREFIX}{suffix}_{i}"
        session.execute(
            sa.text(
                f"CREATE {unique or ''}INDEX {temp_index} "
                f"ON {GERRY_DB_SCHEMA}.{temp_view} {rest}"
            )
        )
        index_renames.append((temp_index, index_name))

    session.execute(sa.text(f"ANALYZE {GERRY_DB_SCHEMA}.{temp_view}"))
    rows_after = session.execute(
        sa.text(f"SELECT count(*) FROM {GERRY_DB_SCHEMA}.{temp_view}")
    ).scalar_one()

    session.execute(sa.text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
    session.execute(sa.text(f"DROP MATERIALIZED VIEW {GERRY_DB_SCHEMA}.{view}"))
    session.execute(
        sa.text(
            f"ALTER MATERIALIZED VIEW {GERRY_DB_SCHEMA}.{temp_view} RENAME TO {view}"
        )
    )
    for temp_index, index_name in index_renames:
        session.execute(
            sa.text(
                f"ALTER INDEX {GERRY_DB_SCHEMA}.{temp_index} "
                f"RENAME TO {_quote_ident(index_name)}"
            )
        )

    return RebuildViewResult(
        parent_layer=parent,
        child_layer=child,
        columns=view_columns,
        rows_before=rows_before,
        rows_after=rows_after,
        indexes=[name for _, name in index_renames],
    )


@dataclass
class InvalidationCounts:
    documents: int
    district_unions: int
    evaluations: int
    stats_published: int
    county_demographics: int


def invalidate_document_caches(
    session: Session, gerrydb_table_name: str, dry_run: bool = False
) -> InvalidationCounts:
    """Drop cached derivatives of `gerrydb_table_name` so they recompute on next read.

    For every document on a districtr map with this `gerrydb_table_name`:
    deletes its `document.district_unions` and `document.evaluation` rows and
    clears `stats_published_at`, so `/stats` computes inline and republishes
    instead of redirecting to the published GeoJSON. Also deletes the
    `evaluation.county_demographics` rows of those maps' parent layers, the
    key county aggregation uses. Documents on other gerrydb tables keep all
    their rows. With `dry_run`, only counts.

    `CountyContext` keeps its own in-process copy of county results until the
    backend process restarts.
    """
    maps = session.exec(
        select(DistrictrMap.districtr_map_slug, DistrictrMap.parent_layer).where(
            DistrictrMap.gerrydb_table_name == gerrydb_table_name
        )
    ).all()
    if not maps:
        raise ValueError(f"No districtr maps use gerrydb table {gerrydb_table_name}")
    slugs = [slug for slug, _ in maps]
    parent_layers = sorted({parent for _, parent in maps})

    document_ids = select(Document.document_id).where(
        col(Document.districtr_map_slug).in_(slugs)
    )
    unions_filter = col(DistrictUnions.document_id).in_(document_ids)
    evaluations_filter = col(Evaluation.document_id).in_(document_ids)
    published_filter = sa.and_(
        col(Document.districtr_map_slug).in_(slugs),
        col(Document.stats_published_at).is_not(None),
    )
    county_filter = col(CountyDemographics.gerrydb_table_name).in_(parent_layers)

    def count(model, condition) -> int:
        return session.exec(
            select(func.count()).select_from(model).where(condition)
        ).one()

    counts = InvalidationCounts(
        documents=count(Document, col(Document.districtr_map_slug).in_(slugs)),
        district_unions=count(DistrictUnions, unions_filter),
        evaluations=count(Evaluation, evaluations_filter),
        stats_published=count(Document, published_filter),
        county_demographics=count(CountyDemographics, county_filter),
    )
    if dry_run:
        return counts

    session.execute(delete(DistrictUnions).where(unions_filter))
    session.execute(delete(Evaluation).where(evaluations_filter))
    session.execute(
        update(Document).where(published_filter).values(stats_published_at=None)
    )
    session.execute(delete(CountyDemographics).where(county_filter))
    return counts
