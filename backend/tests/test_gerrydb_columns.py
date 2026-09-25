"""Adding columns to an onboarded GerryDB layer and refreshing its derivatives.

`add-gerrydb-columns` runs as a CLI subprocess: ogr2ogr writes its staging
table through its own connection, so the target table is committed and
dropped by the fixture. The view rebuild and cache invalidation run on the
rollback session, next to documents created through the API.
"""

import json
import subprocess
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import func, text, update
from sqlmodel import Session, select

from app.constants import GERRY_DB_SCHEMA
from app.evaluation.models import CountyDemographics, Evaluation
from app.models import DistrictUnions, Document
from app.utils import get_gerrydb_numeric_cols
from management.gerrydb_columns import (
    REBUILD_PREFIX,
    STAGING_TABLE_PREFIX,
    invalidate_document_caches,
    rebuild_shatterable_view,
)
from tests.constants import GERRY_DB_FIXTURE_NAME, OGR2OGR_PG_CONNECTION_STRING
from tests.test_cli import run_cli

TARGET_TABLE = "add_columns_test_layer"

BASE_ROWS = [
    {"path": "blk_a", "total_pop_20": 10, "pres_20_dem": 4},
    {"path": "blk_b", "total_pop_20": 20, "pres_20_dem": 7},
    {"path": "blk_c", "total_pop_20": 30, "pres_20_dem": 11},
]
# Shared columns carry different values, so an overwrite would show.
SOURCE_ROWS = [
    {
        "path": row["path"],
        "total_pop_20": row["total_pop_20"] + 1000,
        "pres_20_dem": row["pres_20_dem"] + 1000,
        "pres_24_dem": row["total_pop_20"] // 2,
        "pres_24_rep": row["total_pop_20"] // 3,
        "county_name": f"County {row['path']}",
    }
    for row in BASE_ROWS
]


def _write_geojson(path: Path, rows: list[dict]) -> None:
    features = [
        {
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                    [[[i, 0], [i + 1, 0], [i + 1, 1], [i, 1], [i, 0]]],
                ],
            },
        }
        for i, props in enumerate(rows)
    ]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))


def _write_gpkg(tmp_path: Path, name: str, rows: list[dict]) -> Path:
    geojson = tmp_path / f"{name}.geojson"
    gpkg = tmp_path / f"{name}.gpkg"
    _write_geojson(geojson, rows)
    subprocess.run(
        ["ogr2ogr", "-f", "GPKG", str(gpkg), str(geojson), "-nln", TARGET_TABLE],
        check=True,
    )
    return gpkg


@pytest.fixture
def target_table(engine, tmp_path):
    geojson = tmp_path / "target.geojson"
    _write_geojson(geojson, BASE_ROWS)
    subprocess.run(
        [
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            str(geojson),
            "-lco",
            "OVERWRITE=yes",
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nlt",
            "MULTIPOLYGON",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{TARGET_TABLE}",
        ],
        check=True,
    )
    yield TARGET_TABLE
    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {GERRY_DB_SCHEMA}.{TARGET_TABLE}"))


def _table_rows(engine) -> dict[str, dict]:
    with engine.connect() as conn:
        rows = (
            conn.execute(text(f"SELECT * FROM {GERRY_DB_SCHEMA}.{TARGET_TABLE}"))
            .mappings()
            .all()
        )
    return {
        row["path"]: {k: v for k, v in row.items() if k not in ("geometry", "ogc_fid")}
        for row in rows
    }


def _table_columns(engine) -> list[str]:
    with engine.connect() as conn:
        return list(
            conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = :schema AND table_name = :name "
                    "ORDER BY ordinal_position"
                ),
                {"schema": GERRY_DB_SCHEMA, "name": TARGET_TABLE},
            ).scalars()
        )


def _staging_table_count(engine) -> int:
    with engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT count(*) FROM pg_tables WHERE schemaname = :schema "
                "AND left(tablename, length(:prefix)) = :prefix"
            ),
            {"schema": GERRY_DB_SCHEMA, "prefix": STAGING_TABLE_PREFIX},
        ).scalar_one()


def _add_columns(*extra: str, gpkg: Path) -> subprocess.CompletedProcess:
    return run_cli(
        "add-gerrydb-columns", "--table", TARGET_TABLE, "--gpkg", str(gpkg), *extra
    )


def test_add_gerrydb_columns_preserves_existing_values(engine, tmp_path, target_table):
    before = _table_rows(engine)
    gpkg = _write_gpkg(tmp_path, "source", SOURCE_ROWS)

    result = _add_columns(gpkg=gpkg)

    assert result.returncode == 0, result.stderr
    after = _table_rows(engine)
    assert after.keys() == before.keys()
    for path, row in before.items():
        for column, value in row.items():
            assert after[path][column] == value, (path, column)
    for source in SOURCE_ROWS:
        assert after[source["path"]]["pres_24_dem"] == source["pres_24_dem"]
        assert after[source["path"]]["pres_24_rep"] == source["pres_24_rep"]
    # Only numeric columns are added by default.
    assert "county_name" not in _table_columns(engine)
    assert _staging_table_count(engine) == 0


def test_add_gerrydb_columns_rerun_requires_replace(engine, tmp_path, target_table):
    gpkg = _write_gpkg(tmp_path, "source", SOURCE_ROWS)
    columns = ("--columns", "pres_24_dem,pres_24_rep")
    assert _add_columns(*columns, gpkg=gpkg).returncode == 0
    first = _table_rows(engine)

    changed = _write_gpkg(
        tmp_path,
        "changed",
        [{**row, "pres_24_dem": row["pres_24_dem"] + 100} for row in SOURCE_ROWS],
    )
    for extra in (columns, ()):
        result = _add_columns(*extra, gpkg=changed)
        assert result.returncode != 0, extra
        assert "already exist" in result.stderr, result.stderr
        assert _table_rows(engine) == first

    result = _add_columns("--columns", "pres_24_dem", "--replace", gpkg=changed)
    assert result.returncode == 0, result.stderr
    replaced = _table_rows(engine)
    for path, row in first.items():
        for column, value in row.items():
            expected = value + 100 if column == "pres_24_dem" else value
            assert replaced[path][column] == expected, (path, column)
    assert _staging_table_count(engine) == 0


@pytest.mark.parametrize(
    "source_rows, message",
    [
        (SOURCE_ROWS[:-1], "1 table paths are missing from the GeoPackage"),
        (
            SOURCE_ROWS + [{**SOURCE_ROWS[0], "path": "blk_z"}],
            "1 GeoPackage paths are missing from the table",
        ),
    ],
    ids=["gpkg_lacks_path", "table_lacks_path"],
)
def test_add_gerrydb_columns_path_mismatch_changes_nothing(
    engine, tmp_path, target_table, source_rows, message
):
    columns_before = _table_columns(engine)
    rows_before = _table_rows(engine)
    gpkg = _write_gpkg(tmp_path, "source", source_rows)

    result = _add_columns(gpkg=gpkg)

    assert result.returncode != 0
    assert message in result.stderr, result.stderr
    assert _table_columns(engine) == columns_before
    assert _table_rows(engine) == rows_before
    assert _staging_table_count(engine) == 0


def _add_election_column(session: Session, table: str) -> None:
    session.execute(
        text(f"ALTER TABLE {GERRY_DB_SCHEMA}.{table} ADD COLUMN pres_24_dem integer")
    )
    session.execute(
        text(f"UPDATE {GERRY_DB_SCHEMA}.{table} SET pres_24_dem = total_pop_20 / 2")
    )


def _view_state(session: Session) -> tuple[int, int, list[tuple[str, str]]]:
    rows = session.execute(
        text("SELECT count(*) FROM gerrydb.simple_geos")
    ).scalar_one()
    gerrydbtable_rows = session.execute(
        text("SELECT count(*) FROM gerrydbtable WHERE name = 'simple_geos'")
    ).scalar_one()
    indexes = session.execute(
        text(
            "SELECT indexname, indexdef FROM pg_indexes "
            "WHERE schemaname = 'gerrydb' AND tablename = 'simple_geos'"
        )
    ).all()
    return rows, gerrydbtable_rows, [tuple(i) for i in indexes]


def test_rebuild_shatterable_view_adds_columns_keeps_rows_and_indexes(
    session: Session, simple_shatterable_districtr_map
):
    session.execute(
        text("CREATE UNIQUE INDEX simple_geos_path_idx ON gerrydb.simple_geos (path)")
    )
    rows_before, gerrydbtable_before, indexes_before = _view_state(session)
    _add_election_column(session, "simple_parent_geos")
    _add_election_column(session, "simple_child_geos")
    assert "pres_24_dem" not in get_gerrydb_numeric_cols(session, "simple_geos")

    # A second run over the rebuilt view is the idempotence check.
    for _ in range(2):
        rebuild_shatterable_view(session, "simple_geos")

        assert "pres_24_dem" in get_gerrydb_numeric_cols(session, "simple_geos")
        assert _view_state(session) == (
            rows_before,
            gerrydbtable_before,
            indexes_before,
        )
    layer_total = session.execute(
        text(
            "SELECT (SELECT sum(pres_24_dem) FROM gerrydb.simple_parent_geos)"
            " + (SELECT sum(pres_24_dem) FROM gerrydb.simple_child_geos)"
        )
    ).scalar_one()
    view_total = session.execute(
        text("SELECT sum(pres_24_dem) FROM gerrydb.simple_geos")
    ).scalar_one()
    assert view_total == layer_total
    leftovers = session.execute(
        text(
            "SELECT count(*) FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'gerrydb' "
            "AND left(c.relname, length(:prefix)) = :prefix"
        ),
        {"prefix": REBUILD_PREFIX},
    ).scalar_one()
    assert leftovers == 0


SIMPLE_ASSIGNMENTS = [
    ["000010000000001", 1],
    ["000010000000002", 1],
    ["000010000000003", 2],
]


def _create_document(client, districtr_map_slug: str) -> str:
    response = client.post(
        "/api/create_document", json={"districtr_map_slug": districtr_map_slug}
    )
    assert response.status_code == 201, response.json()
    return response.json()["document_id"]


def _put_assignments(client, document_id: str, assignments: list[list]) -> None:
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": assignments,
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200, response.json()


def _read_stats(client, document_id: str) -> list[dict]:
    response = client.get(f"/api/document/{document_id}/stats")
    assert response.status_code == 200, response.text
    return [feature["properties"] for feature in response.json()["features"]]


def _cache_state(session: Session, document_id: str) -> tuple[int, int, bool]:
    unions = session.exec(
        select(func.count())
        .select_from(DistrictUnions)
        .where(DistrictUnions.document_id == document_id)
    ).one()
    evaluations = session.exec(
        select(func.count())
        .select_from(Evaluation)
        .where(Evaluation.document_id == document_id)
    ).one()
    published_at = session.exec(
        select(Document.stats_published_at).where(Document.document_id == document_id)
    ).one()
    return unions, evaluations, published_at is not None


def _county_rows(session: Session, gerrydb_table_name: str) -> int:
    return session.exec(
        select(func.count())
        .select_from(CountyDemographics)
        .where(CountyDemographics.gerrydb_table_name == gerrydb_table_name)
    ).one()


def _seed_caches(session: Session, document_id: str, parent_layer: str) -> None:
    session.add(Evaluation(document_id=document_id, metrics={}, payload_version=0))
    session.add(
        CountyDemographics(
            geoid="00001",
            gerrydb_table_name=parent_layer,
            total_pop=1,
            demographic_data={},
        )
    )
    session.execute(
        update(Document)
        .where(Document.document_id == document_id)
        .values(stats_published_at=func.now())
    )
    session.commit()


def test_invalidate_document_caches_scoped_to_target_table(
    client,
    session: Session,
    simple_shatterable_districtr_map,
    ks_demo_view_census_blocks_districtrmap,
):
    target = _create_document(client, "simple_geos")
    other = _create_document(client, GERRY_DB_FIXTURE_NAME)
    _put_assignments(client, target, SIMPLE_ASSIGNMENTS)
    _put_assignments(client, other, [["202090441022004", 1]])
    _read_stats(client, target)
    _read_stats(client, other)
    _seed_caches(session, target, "simple_parent_geos")
    _seed_caches(session, other, GERRY_DB_FIXTURE_NAME)

    target_before = _cache_state(session, target)
    other_before = _cache_state(session, other)
    assert target_before[0] > 0 and target_before[1:] == (1, True)
    assert other_before[0] > 0 and other_before[1:] == (1, True)

    dry = invalidate_document_caches(session, "simple_geos", dry_run=True)
    assert (
        dry.documents,
        dry.district_unions,
        dry.evaluations,
        dry.stats_published,
        dry.county_demographics,
    ) == (1, target_before[0], 1, 1, 1)
    assert _cache_state(session, target) == target_before
    assert _county_rows(session, "simple_parent_geos") == 1

    counts = invalidate_document_caches(session, "simple_geos")
    assert counts == dry
    assert _cache_state(session, target) == (0, 0, False)
    assert _county_rows(session, "simple_parent_geos") == 0
    assert _cache_state(session, other) == other_before
    assert _county_rows(session, GERRY_DB_FIXTURE_NAME) == 1

    # Re-running over already-invalidated documents is a no-op.
    again = invalidate_document_caches(session, "simple_geos")
    assert (again.district_unions, again.evaluations, again.stats_published) == (
        0,
        0,
        0,
    )


def test_stats_recompute_after_invalidation_include_new_columns(
    client, session: Session, simple_shatterable_districtr_map
):
    document_id = _create_document(client, "simple_geos")
    _put_assignments(client, document_id, SIMPLE_ASSIGNMENTS)
    assert all(
        "pres_24_dem" not in zone["demographic_data"]
        for zone in _read_stats(client, document_id)
    )

    _add_election_column(session, "simple_parent_geos")
    _add_election_column(session, "simple_child_geos")
    rebuild_shatterable_view(session, "simple_geos")
    # Cached zone rows keep serving the old column set until invalidated.
    assert all(
        "pres_24_dem" not in zone["demographic_data"]
        for zone in _read_stats(client, document_id)
    )

    invalidate_document_caches(session, "simple_geos")
    zones = {zone["zone"]: zone for zone in _read_stats(client, document_id)}

    assert set(zones) == {1, 2, None}
    assert all("pres_24_dem" in zone["demographic_data"] for zone in zones.values())
    zone_1_expected = session.execute(
        text(
            "SELECT sum(pres_24_dem) FROM gerrydb.simple_child_geos "
            "WHERE path = ANY(:paths)"
        ),
        {"paths": [geo_id for geo_id, zone in SIMPLE_ASSIGNMENTS if zone == 1]},
    ).scalar_one()
    assert zones[1]["demographic_data"]["pres_24_dem"] == zone_1_expected
