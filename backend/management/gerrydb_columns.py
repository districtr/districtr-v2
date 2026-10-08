"""Add columns to an onboarded GerryDB layer and refresh everything derived from it.

The three steps run in this order for each layer pair of a shatterable view:

1. `add_gerrydb_columns` on the parent and the child table.
2. `rebuild_shatterable_view` on the view that unions them.
3. `invalidate_document_caches` on the same view, so documents recompute
   their cached stats and evaluations on next read.

Values already in a GerryDB table never change: every added column must be new
to the table.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import pandas as pd
import pyogrio
import sqlalchemy as sa
from sqlalchemy import delete, update
from sqlmodel import Session, col, func, select

from app.constants import GERRY_DB_SCHEMA
from app.core.io import get_local_or_s3_path
from app.evaluation.models import Evaluation
from app.models import DistrictrMap, DistrictUnions, Document
from app.utils import _quote_ident, assert_safe_ident, build_shatterable_view

logger = logging.getLogger(__name__)

REBUILD_PREFIX = "_rebuild_"

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
    table: str
    added: list[str]
    filled: list[str]
    rows_updated: int


_SQL_TYPES = {"int64": "bigint", "int32": "integer", "float64": "double precision"}


def _read_gpkg_columns(gpkg: str, layer: str, columns: list[str]) -> pd.DataFrame:
    """`path` plus the named numeric columns of one GeoPackage layer, no geometry."""
    df = pyogrio.read_dataframe(
        get_local_or_s3_path(gpkg, replace=True),
        layer=layer,
        columns=["path", *columns],
        read_geometry=False,
    )
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise ValueError(f"Columns missing from the GeoPackage: {missing}")
    non_numeric = [c for c in columns if str(df[c].dtype) not in _SQL_TYPES]
    if non_numeric:
        raise ValueError(f"Columns are not numeric in the GeoPackage: {non_numeric}")
    return df


def add_gerrydb_columns(
    session: Session,
    gpkg: str,
    columns: list[str],
) -> AddColumnsResult:
    """Add GeoPackage columns to an existing `gerrydb.<table>`, matched on `path`.

    The table and the GeoPackage layer are both the GeoPackage's file name
    (`<table>.gpkg`). Only `path` and the named numeric columns are read. A
    named column must be missing from the table or hold only NULLs, so a run
    interrupted before its fill committed can simply be re-run. Missing columns
    are committed first; then one transaction copies the values into a
    temporary table and fills every named column with `UPDATE ... FROM` it.
    If the fill fails, the columns this run added are dropped again. Table rows
    without a GeoPackage row keep NULL. The caller commits the fill.
    """
    table = assert_safe_ident(Path(urlparse(gpkg).path).stem)
    for name in columns:
        assert_safe_ident(name)
    if _relkind(session, table) != "r":
        raise ValueError(f"{GERRY_DB_SCHEMA}.{table} is not an existing table")
    table_types = _column_types(session, table)
    existing = [c for c in columns if c in table_types]
    if existing:
        session.execute(sa.text("SET LOCAL statement_timeout = '0'"))
        non_null = session.execute(
            sa.text(
                "SELECT "
                + ", ".join(f"count({_quote_ident(c)})" for c in existing)
                + f" FROM {GERRY_DB_SCHEMA}.{table}"
            )
        ).one()
        with_data = [c for c, n in zip(existing, non_null) if n]
        if with_data:
            raise ValueError(
                f"Columns already hold data in {GERRY_DB_SCHEMA}.{table}: {with_data}"
            )
    to_add = [c for c in columns if c not in table_types]

    logger.info("Reading %s", gpkg)
    values = _read_gpkg_columns(gpkg, table, columns)
    sql_types = {c: _SQL_TYPES[str(values[c].dtype)] for c in columns}

    # Adding a nullable column is instant but needs an exclusive lock, which
    # would block every reader of the table until the UPDATE finished. It is
    # committed on its own; the new columns stay invisible to requests until
    # the shatterable view is rebuilt, because stats read the view.
    if to_add:
        session.execute(sa.text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
        session.execute(
            sa.text(
                f"ALTER TABLE {GERRY_DB_SCHEMA}.{table} "
                + ", ".join(
                    f"ADD COLUMN {_quote_ident(c)} {sql_types[c]}" for c in to_add
                )
            )
        )
        session.commit()

    try:
        session.execute(sa.text("SET LOCAL statement_timeout = '0'"))
        session.execute(
            sa.text(
                "CREATE TEMP TABLE new_values (path text PRIMARY KEY, "
                + ", ".join(f"{_quote_ident(c)} {sql_types[c]}" for c in columns)
                + ") ON COMMIT DROP"
            )
        )
        column_list = ", ".join(_quote_ident(c) for c in ["path", *columns])
        rows = values[["path", *columns]].astype(object)
        rows = rows.where(rows.notna(), None)
        with session.connection().connection.cursor() as cursor:
            with cursor.copy(f"COPY new_values ({column_list}) FROM STDIN") as copy:
                for row in rows.itertuples(index=False, name=None):
                    copy.write_row(row)
        assignments = ", ".join(
            f"{_quote_ident(c)} = v.{_quote_ident(c)}" for c in columns
        )
        rows_updated = session.execute(
            sa.text(
                f"UPDATE {GERRY_DB_SCHEMA}.{table} AS t SET {assignments} "
                "FROM new_values AS v WHERE t.path = v.path"
            )
        ).rowcount
    except Exception:
        session.rollback()
        _drop_columns_autocommit(session, table, to_add)
        raise

    logger.info(
        "Updated %s rows of %s.%s (filled %s, added %s)",
        rows_updated,
        GERRY_DB_SCHEMA,
        table,
        columns,
        to_add,
    )
    return AddColumnsResult(
        table=table, added=to_add, filled=list(columns), rows_updated=rows_updated
    )


@dataclass
class RebuildViewResult:
    parent_layer: str
    child_layer: str
    columns: list[str]


def rebuild_shatterable_view(
    session: Session, gerrydb_table_name: str
) -> RebuildViewResult:
    """Recreate the shatterable materialized view with its layers' current columns.

    The replacement is built under a temporary name, then the old view is
    dropped and the new one renamed into place, all in the caller's
    transaction: readers see the old view until commit and the new one after.
    The `gerrydbtable` row is left as is. The parent and child layers come from
    the districtr maps whose `gerrydb_table_name` is this view.
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
    parent, child = layer_pairs[0]

    session.execute(sa.text("SET LOCAL statement_timeout = '0'"))
    temp_view = f"{REBUILD_PREFIX}{uuid4().hex[:16]}"
    columns = build_shatterable_view(session, parent, child, temp_view)

    session.execute(sa.text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
    session.execute(sa.text(f"DROP MATERIALIZED VIEW {GERRY_DB_SCHEMA}.{view}"))
    session.execute(
        sa.text(
            f"ALTER MATERIALIZED VIEW {GERRY_DB_SCHEMA}.{temp_view} RENAME TO {view}"
        )
    )
    return RebuildViewResult(parent_layer=parent, child_layer=child, columns=columns)


@dataclass
class InvalidationCounts:
    documents: int
    district_unions: int
    evaluations: int
    stats_published: int


def invalidate_document_caches(
    session: Session, gerrydb_table_name: str, dry_run: bool = False
) -> InvalidationCounts:
    """Drop cached derivatives of `gerrydb_table_name` so they recompute on next read.

    For every document on a districtr map with this `gerrydb_table_name`:
    deletes its `document.district_unions` and `document.evaluation` rows and
    clears `stats_published_at`, so `/stats` computes inline and republishes
    instead of redirecting to the published GeoJSON. Documents on other gerrydb
    tables keep all their rows. With `dry_run`, only counts. County aggregates
    refresh themselves when an evaluation asks for a new column
    (`CountyContext.eguia_ideal`).
    """
    slugs = session.exec(
        select(DistrictrMap.districtr_map_slug).where(
            DistrictrMap.gerrydb_table_name == gerrydb_table_name
        )
    ).all()
    if not slugs:
        raise ValueError(f"No districtr maps use gerrydb table {gerrydb_table_name}")

    document_ids = select(Document.document_id).where(
        col(Document.districtr_map_slug).in_(slugs)
    )
    unions_filter = col(DistrictUnions.document_id).in_(document_ids)
    evaluations_filter = col(Evaluation.document_id).in_(document_ids)
    published_filter = sa.and_(
        col(Document.districtr_map_slug).in_(slugs),
        col(Document.stats_published_at).is_not(None),
    )

    def count(model, condition) -> int:
        return session.exec(
            select(func.count()).select_from(model).where(condition)
        ).one()

    counts = InvalidationCounts(
        documents=count(Document, col(Document.districtr_map_slug).in_(slugs)),
        district_unions=count(DistrictUnions, unions_filter),
        evaluations=count(Evaluation, evaluations_filter),
        stats_published=count(Document, published_filter),
    )
    if dry_run:
        return counts

    session.execute(delete(DistrictUnions).where(unions_filter))
    session.execute(delete(Evaluation).where(evaluations_filter))
    session.execute(
        update(Document).where(published_filter).values(stats_published_at=None)
    )
    return counts
