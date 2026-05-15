import csv as _csv
import os
import pickle
import pytest
from app.main import app
from app.core.db import get_session
from app.core.security import auth
from fastapi.testclient import TestClient
from sqlalchemy.event import listens_for
from sqlmodel import create_engine, Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
import subprocess
import app.evaluation.graph as eval_graph_module
from app.evaluation.graph import get_graph as _get_graph_cached
from networkx import Graph
from tests.constants import (
    POSTGRES_TEST_DB,
    TEARDOWN_TEST_DB,
    TEST_SQLALCHEMY_DATABASE_URI,
    TEST_POSTGRES_CONNECTION_STRING,
    FIXTURES_PATH,
    OGR2OGR_PG_CONNECTION_STRING,
    GERRY_DB_FIXTURE_NAME,
    ACCOUNT_AUTH0_ID,
)
from app.constants import GERRY_DB_SCHEMA
from app.utils import (
    create_districtr_map,
    create_shatterable_gerrydb_view,
    create_parent_child_edges,
)

client = TestClient(app)


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    def get_auth_result_override():
        return {"sub": ACCOUNT_AUTH0_ID}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[auth.verify] = get_auth_result_override

    client = TestClient(app, headers={"origin": "http://localhost:5173"})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="client_isolated_sessions")
def client_isolated_sessions_fixture(engine):
    """TestClient where each request uses a new Session(engine), like production.

    Avoids a single long-lived session/transaction (e.g. rollback_session) where
    PostgreSQL ``now()`` is frozen for the whole test.
    """

    def get_session_override():
        with Session(engine, expire_on_commit=True) as request_session:
            yield request_session

    def get_auth_result_override():
        return {"sub": ACCOUNT_AUTH0_ID}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[auth.verify] = get_auth_result_override

    isolated_client = TestClient(app, headers={"origin": "http://localhost:5173"})
    yield isolated_client
    app.dependency_overrides.clear()


my_env = os.environ.copy()
my_env["POSTGRES_DB"] = POSTGRES_TEST_DB


@pytest.fixture(scope="session", name="engine")
def engine_fixture(request):
    url = TEST_POSTGRES_CONNECTION_STRING
    _engine = create_engine(url)
    conn = _engine.connect()
    conn.execute(text("commit"))
    try:
        if conn.in_transaction():
            conn.rollback()
        conn.execution_options(isolation_level="AUTOCOMMIT").execute(
            text(f"CREATE DATABASE {POSTGRES_TEST_DB}")
        )
    except (OperationalError, ProgrammingError):
        pass

    try:
        subprocess.run(
            ["alembic", "upgrade", "head"],
            check=True,
            env=my_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print("Alembic upgrade failed:")
        print("Return code:", e.returncode)
        print(
            "Standard Output:", e.output or e.stdout
        )  # Prints any general output from the command
        print("Error Output:", e.stderr)  # Prints only the error output
        raise e

    def teardown():
        if TEARDOWN_TEST_DB:
            close_connections_query = f"""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = '{POSTGRES_TEST_DB}'
                AND pid <> pg_backend_pid();
                """
            conn.execute(text(close_connections_query))
            conn.execute(text(f"DROP DATABASE {POSTGRES_TEST_DB}"))
        conn.close()

    request.addfinalizer(teardown)

    return create_engine(str(TEST_SQLALCHEMY_DATABASE_URI), echo=True)


@pytest.fixture
def persistent_session(engine):
    with Session(engine, expire_on_commit=True) as session:
        yield session


# https://github.com/fastapi/sqlmodel/discussions/940
@pytest.fixture
def rollback_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    nested = connection.begin_nested()

    @listens_for(session, "after_transaction_end")
    def end_savepoint(session, transaction):
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


# from functools import partial


@pytest.fixture
def session(request):
    if TEARDOWN_TEST_DB:
        return request.getfixturevalue("rollback_session")
    else:
        return request.getfixturevalue("persistent_session")


@pytest.fixture(name=GERRY_DB_FIXTURE_NAME)
def ks_demo_view_census_blocks_fixture(session: Session):
    layer = GERRY_DB_FIXTURE_NAME
    subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
            "-lco",
            "OVERWRITE=yes",
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )


@pytest.fixture(name="ks_demo_view_census_blocks_districtrmap")
def ks_demo_view_census_blocks_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks: None
):
    upsert_query = text(
        """
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """
    )

    session.begin()
    session.execute(upsert_query, {"name": GERRY_DB_FIXTURE_NAME})
    create_districtr_map(
        session=session,
        name=f"Districtr map {GERRY_DB_FIXTURE_NAME}",
        districtr_map_slug=GERRY_DB_FIXTURE_NAME,
        gerrydb_table_name=GERRY_DB_FIXTURE_NAME,
        parent_layer=GERRY_DB_FIXTURE_NAME,
    )
    session.commit()


@pytest.fixture(name="document_id")
def document_fixture(client, ks_demo_view_census_blocks_districtrmap):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="simple_parent_geos")
def simple_parent_geos_fixture(session: Session):
    layer = "simple_parent_geos"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
            "-nlt",
            "MULTIPOLYGON",
            "-lco",
            "GEOMETRY_NAME=geometry",
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="simple_child_geos")
def simple_child_geos_fixture(session: Session):
    layer = "simple_child_geos"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
            "-nlt",
            "MULTIPOLYGON",
            "-lco",
            "GEOMETRY_NAME=geometry",
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="simple_parent_geos_gerrydb")
def simple_parent_geos_gerrydb_fixture(session: Session, simple_parent_geos):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)
    session.begin()
    session.execute(upsert_query, {"name": "simple_parent_geos"})
    session.commit()
    session.close()


@pytest.fixture(name="simple_child_geos_gerrydb")
def simple_child_geos_gerrydb_fixture(session: Session, simple_child_geos):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)
    session.begin()
    session.execute(upsert_query, {"name": "simple_child_geos"})
    session.commit()
    session.close()


@pytest.fixture(name="gerrydb_simple_geos_view")
def gerrydb_simple_geos_view_fixture(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    create_shatterable_gerrydb_view(
        session,
        parent_layer="simple_parent_geos",
        child_layer="simple_child_geos",
        gerrydb_table_name="simple_geos",
    )
    session.commit()
    return


@pytest.fixture(name="simple_shatterable_districtr_map")
def simple_parent_child_geos_districtr_map_fixture(
    session: Session, gerrydb_simple_geos_view
):
    """
    Parents     Children
    A – C       a – e – f
    |   |       |   |   |
    B ––        c – b ––
                |   |
                d ––

    where
    - A = { a, e }
    - B = { b, c, d}
    - C = { f }
    """
    inserted_districtr_map = create_districtr_map(
        session,
        name="Simple shatterable layer",
        districtr_map_slug="simple_geos",
        gerrydb_table_name="simple_geos",
        num_districts=3,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer="simple_parent_geos",
        child_layer="simple_child_geos",
    )
    create_parent_child_edges(
        session=session, districtr_map_uuid=inserted_districtr_map
    )
    session.commit()
    return inserted_districtr_map


@pytest.fixture
def simple_shatterable_districtr_map_no_edges_yet(
    session: Session, gerrydb_simple_geos_view
):
    inserted_districtr_map = create_districtr_map(
        session,
        name="Simple shatterable layer",
        districtr_map_slug="simple_geos",
        gerrydb_table_name="simple_geos",
        num_districts=3,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer="simple_parent_geos",
        child_layer="simple_child_geos",
    )
    session.commit()
    return inserted_districtr_map


@pytest.fixture(name="ks_ellis_county_vtd")
def ks_ellis_county_vtd_fixture(session: Session):
    layer = "ks_ellis_county_vtd"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.gpkg",
            "ks_ellis_county_vap_data_vtd",
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
            "-nlt",
            "MULTIPOLYGON",
            "-lco",
            "GEOMETRY_NAME=geometry",
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="ks_ellis_county_block")
def ks_ellis_county_block_fixture(session: Session):
    layer = "ks_ellis_county_block"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.gpkg",
            "ks_ellis_county_vap_data_block",
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
            "-nlt",
            "MULTIPOLYGON",
            "-lco",
            "GEOMETRY_NAME=geometry",
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="ks_ellis_county_vtd_gerrydb")
def ks_ellis_county_vtd_gerrydb_fixture(session: Session, ks_ellis_county_vtd):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)
    session.begin()
    session.execute(upsert_query, {"name": "ks_ellis_county_vtd"})
    session.commit()
    session.close()


@pytest.fixture
def ks_ellis_county_block_gerrydb(session: Session, ks_ellis_county_block):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)
    session.begin()
    session.execute(upsert_query, {"name": "ks_ellis_county_block"})
    session.commit()
    session.close()


@pytest.fixture
def gerrydb_ks_ellis_geos_view(
    session: Session, ks_ellis_county_vtd_gerrydb, ks_ellis_county_block_gerrydb
):
    create_shatterable_gerrydb_view(
        session,
        parent_layer="ks_ellis_county_vtd",
        child_layer="ks_ellis_county_block",
        gerrydb_table_name="ks_ellis_geos",
    )
    session.commit()
    return


@pytest.fixture
def ks_ellis_shatterable_districtr_map(
    session: Session, ks_ellis_county_vtd_gerrydb, ks_ellis_county_block_gerrydb
):
    inserted_districtr_map = create_districtr_map(
        session,
        name="ks_ellis shatterable layer",
        districtr_map_slug="ks_ellis_geos",
        gerrydb_table_name="ks_ellis_geos",
        num_districts=10,
        tiles_s3_path="tilesets/ks_ellis_shatterable_layer.pmtiles",
        parent_layer="ks_ellis_county_vtd",
        child_layer="ks_ellis_county_block",
    )
    session.commit()
    return inserted_districtr_map


@pytest.fixture
def ks_ellis_parent_layer_only_districtr_map(
    session: Session, ks_ellis_county_block_gerrydb
):
    inserted_districtr_map = create_districtr_map(
        session,
        name="ks_ellis parent geos only layer",
        districtr_map_slug="ks_ellis_county_block",
        gerrydb_table_name="ks_ellis_county_block",
        num_districts=2,
        tiles_s3_path="tilesets/ks_ellis_shatterable_layer.pmtiles",
        parent_layer="ks_ellis_county_block",
    )
    session.commit()
    return inserted_districtr_map


@pytest.fixture(name="simple_geos_gml_path")
def simple_child_geos_gml_path_fixture() -> str:
    return str(FIXTURES_PATH / "graph" / "simple_child_geos.gml")


# ── Grid graph fixtures (8×8 blocks / 4×4 VTDs / 8 counties) ────────────────
#
# Census-style GEOIDs encode the county→VTD→block hierarchy:
#   county  c = (r//2)*2 + (col//4)   — 8 counties (0..7), 5-digit FIPS "ccccc"
#   VTD    (pr, pc): county=pr*2+pc//2, within-county index=pc%2
#           geo_id = "vtd:{county:05d}{pc%2:06d}"   (vtd: prefix → unit_type="vtd")
#   block  (r, c): county=(r//2)*2+(c//4), within-county index=(r%2)*4+(c%4)
#           geo_id = "{county:05d}{idx:07d}"          (bare → unit_type="block")
#
# _populate_county_data extracts LEFT(path, 5) / LEFT(SPLIT_PART(path,':',2), 5)
# for the county GEOID — both encodings map to f"{county:05d}". ✓
#
# All parent-adjacency edge weights = 2 (two block edges cross each VTD boundary).

BLOCK_GRID_NAME = "grid_child"
PARENT_GRID_NAME = "grid_parent"

_GRID_ELEC_COLS = [
    "pres_2016_dem", "pres_2016_rep",
    "pres_2020_dem", "pres_2020_rep",
    "pres_2024_dem", "pres_2024_rep",
    "sen_2016_dem", "sen_2016_rep",
    "sen_2018_dem", "sen_2018_rep",
    "sen_2020_dem", "sen_2020_rep",
    "sen_2022_dem", "sen_2022_rep",
]

# Block and VTD demographic data is stored in fixtures/gerrydb/grid_child.csv (64 rows)
# and fixtures/gerrydb/grid_parent.csv (16 rows).
#
# County layout (county = (row//2)*2 + (col//4)):
#   cols 0-3   cols 4-7
#   --------   --------
#   0          1         rows 0-1
#   2          3         rows 2-3
#   4          5         rows 4-5
#   6          7         rows 6-7
# Districts: zone = row + 1, each district spans both county columns.
#
# Generation script (requires gerrychain/gerrytools, PYTHONHASHSEED=0):
#
#   import numpy as np, networkx as nx
#   from gerrychain import Graph, Partition
#   from gerrychain.updaters import Election, Tally
#   from gerrytools.scoring.partisan import _eguia_election
#
#   rng = np.random.default_rng(99)
#   cells = {}
#   for n in range(64):
#       row, col = divmod(n, 8)
#       data = {"total_pop_20": int(rng.integers(500, 2001)),
#               "county": (row // 2) * 2 + (col // 4),
#               "zone":   row + 1}
#       for elec in ELECTIONS:
#           total = int(rng.integers(200, 801))
#           dem = int(rng.integers(int(total * 0.3), int(total * 0.7) + 1))
#           data[f"{elec}_dem"] = dem
#           data[f"{elec}_rep"] = total - dem
#       cells[n] = data
#
#   g = nx.convert_node_labels_to_integers(nx.grid_2d_graph(8, 8))
#   for n in range(64): g.nodes[n].update(cells[n])
#   gc_graph = Graph.from_networkx(g)
#
#   updaters = {e: Election(e, {"Democratic": f"{e}_dem", "Republican": f"{e}_rep"}) for e in ELECTIONS}
#   updaters["total_pop_20"] = Tally("total_pop_20")
#   district_part = Partition(gc_graph, {n: cells[n]["zone"]   for n in range(64)}, updaters=updaters)
#   county_part   = Partition(gc_graph, {n: cells[n]["county"] for n in range(64)}, updaters=updaters)
#   # Eguia: _eguia_election(district_part, e, "Democratic", county_part, "total_pop_20")

# Read back for test_partisan.py (needed to derive _GRID_DISTRICT_STATS at import time).
def _read_grid_csv(name: str) -> list[dict]:
    path = FIXTURES_PATH / "gerrydb" / f"{name}.csv"
    with open(path) as f:
        rows = list(_csv.DictReader(f))
    for row in rows:
        for k in row:
            if k != "path":
                row[k] = int(row[k])
    return rows

_GRID_BLOCK_ROWS: list[dict] = _read_grid_csv(BLOCK_GRID_NAME)

_GRID_TABLE_COLS = (
    "path TEXT PRIMARY KEY, total_pop_20 INTEGER, "
    + ", ".join(f"{c} INTEGER" for c in _GRID_ELEC_COLS)
)


def _copy_csv_to_gerrydb(session: Session, table_name: str, csv_name: str) -> None:
    path = FIXTURES_PATH / "gerrydb" / f"{csv_name}.csv"
    cursor = session.connection().connection.cursor()
    with open(path) as f, cursor.copy(
        f"COPY gerrydb.{table_name} FROM STDIN CSV HEADER"
    ) as copy:
        for line in f:
            copy.write(line)


def _block_geoid(r: int, c: int) -> str:
    """12-char block GEOID: 5-digit county FIPS + 7-digit within-county index."""
    county = (r // 2) * 2 + (c // 4)
    return f"{county:05d}{(r % 2) * 4 + (c % 4):07d}"


def _vtd_geoid(pr: int, pc: int) -> str:
    """VTD geo_id with 'vtd:' prefix: 5-digit county FIPS + 6-digit within-county index."""
    county = pr * 2 + pc // 2
    return f"vtd:{county:05d}{pc % 2:06d}"


def _build_grid_block_graph() -> Graph:
    G = Graph()
    for r in range(8):
        for c in range(8):
            G.add_node(_block_geoid(r, c), parent=_vtd_geoid(r // 2, c // 2))
    for r in range(8):
        for c in range(7):
            G.add_edge(_block_geoid(r, c), _block_geoid(r, c + 1))
    for r in range(7):
        for c in range(8):
            G.add_edge(_block_geoid(r, c), _block_geoid(r + 1, c))
    return G


def _build_grid_parent_graph() -> Graph:
    G = Graph()
    for pr in range(4):
        for pc in range(4):
            G.add_node(_vtd_geoid(pr, pc))
    for pr in range(4):
        for pc in range(3):
            G.add_edge(_vtd_geoid(pr, pc), _vtd_geoid(pr, pc + 1), weight=2)
    for pr in range(3):
        for pc in range(4):
            G.add_edge(_vtd_geoid(pr, pc), _vtd_geoid(pr + 1, pc), weight=2)
    return G


@pytest.fixture(scope="session")
def grid_graph_files():
    """Write the 8×8 block and 4×4 parent pkl files to fixtures/graph/ once per session."""
    child_path = FIXTURES_PATH / "graph" / f"{BLOCK_GRID_NAME}.pkl"
    parent_path = FIXTURES_PATH / "graph" / f"{PARENT_GRID_NAME}.pkl"
    if not child_path.exists():
        with open(child_path, "wb") as f:
            pickle.dump(_build_grid_block_graph(), f)
    if not parent_path.exists():
        with open(parent_path, "wb") as f:
            pickle.dump(_build_grid_parent_graph(), f)


@pytest.fixture(name="mock_grid_graph_file")
def mock_grid_graph_file_fixture(monkeypatch, grid_graph_files):
    """Redirect get_gerrydb_graph_file to fixtures/graph/ and flush the LRU cache."""
    def _get_file(gerrydb_name: str) -> str:
        return str(FIXTURES_PATH / "graph" / f"{gerrydb_name}.pkl")

    monkeypatch.setattr(eval_graph_module, "get_gerrydb_graph_file", _get_file)
    _get_graph_cached.cache_clear()
    yield
    _get_graph_cached.cache_clear()


_UPSERT_GERRYDBTABLE = text("""
    INSERT INTO gerrydbtable (uuid, name, updated_at)
    VALUES (gen_random_uuid(), :name, now())
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
""")


@pytest.fixture(name="grid_child_gerrydb")
def grid_child_gerrydb_fixture(session: Session):
    session.execute(_UPSERT_GERRYDBTABLE, {"name": BLOCK_GRID_NAME})
    session.execute(text(
        f"CREATE TABLE IF NOT EXISTS gerrydb.{BLOCK_GRID_NAME} ({_GRID_TABLE_COLS})"
    ))
    session.flush()
    _copy_csv_to_gerrydb(session, BLOCK_GRID_NAME, BLOCK_GRID_NAME)


@pytest.fixture(name="grid_parent_gerrydb")
def grid_parent_gerrydb_fixture(session: Session):
    session.execute(_UPSERT_GERRYDBTABLE, {"name": PARENT_GRID_NAME})
    session.execute(text(
        f"CREATE TABLE IF NOT EXISTS gerrydb.{PARENT_GRID_NAME} ({_GRID_TABLE_COLS})"
    ))
    session.flush()
    _copy_csv_to_gerrydb(session, PARENT_GRID_NAME, PARENT_GRID_NAME)


@pytest.fixture(name="grid_shatterable_districtr_map")
def grid_shatterable_districtr_map_fixture(session: Session, grid_child_gerrydb, grid_parent_gerrydb):
    return create_districtr_map(
        session,
        name="Grid 8x8 shatterable map",
        districtr_map_slug="grid_shatterable",
        num_districts=4,
        parent_layer=PARENT_GRID_NAME,
        child_layer=BLOCK_GRID_NAME,
    )


@pytest.fixture(name="grid_nonshatterable_child_districtr_map")
def grid_nonshatterable_child_districtr_map_fixture(session: Session, grid_child_gerrydb):
    return create_districtr_map(
        session,
        name="Grid 8x8 non-shatterable block map",
        districtr_map_slug="grid_child",
        gerrydb_table_name=BLOCK_GRID_NAME,
        num_districts=4,
        parent_layer=BLOCK_GRID_NAME,
    )


@pytest.fixture(name="grid_nonshatterable_parent_districtr_map")
def grid_nonshatterable_parent_districtr_map_fixture(session: Session, grid_parent_gerrydb):
    return create_districtr_map(
        session,
        name="Grid 4x4 non-shatterable VTD map",
        districtr_map_slug="grid_parent",
        gerrydb_table_name=PARENT_GRID_NAME,
        num_districts=4,
        parent_layer=PARENT_GRID_NAME,
    )
