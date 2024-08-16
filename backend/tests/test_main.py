import os
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from app.main import app, get_session
from app.constants import GERRY_DB_SCHEMA
from pydantic_core import MultiHostUrl
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
import subprocess
import uuid
from tests.constants import FIXTURES_PATH
from tests.utils import string_to_bool


client = TestClient(app)

ENVIRONMENT = os.environ.get("ENVIRONMENT")
POSTGRES_TEST_DB = os.environ.get("POSTGRES_TEST_DB", "districtr_test")
POSTGRES_SCHEME = "postgresql+psycopg"
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_SERVER = os.environ.get("POSTGRES_SERVER", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", 5432)
TEARDOWN_TEST_DB = string_to_bool(os.environ.get("TEARDOWN_TEST_DB", "true"))

my_env = os.environ.copy()

my_env["POSTGRES_DB"] = POSTGRES_TEST_DB

TEST_SQLALCHEMY_DATABASE_URI = MultiHostUrl.build(
    scheme=POSTGRES_SCHEME,
    username=POSTGRES_USER,
    host=POSTGRES_SERVER,
    port=int(POSTGRES_PORT),
    path=POSTGRES_TEST_DB,
    password=POSTGRES_PASSWORD,
)


def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}


def test_get_session():
    session = get_session()
    assert session is not None
    for s in session:
        assert isinstance(s, Session)


GERRY_DB_FIXTURE_NAME = "ks_demo_view_census_blocks"
GERRY_DB_TOTAL_VAP_FIXTURE_NAME = "ks_demo_view_census_blocks_total_vap"
GERRY_DB_NO_POP_FIXTURE_NAME = "ks_demo_view_census_blocks_no_pop"


## Test DB


@pytest.fixture(scope="session", name="engine")
def engine_fixture(request):
    url = f"{POSTGRES_SCHEME}://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}/postgres"
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

    subprocess.run(["alembic", "upgrade", "head"], check=True, env=my_env)

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


@pytest.fixture(name="session")
def session_fixture(engine):
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    def get_auth_result_override():
        return True

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app, headers={"origin": "http://localhost:5173"})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name=GERRY_DB_FIXTURE_NAME)
def ks_demo_view_census_blocks_fixture(session: Session):
    layer = GERRY_DB_FIXTURE_NAME
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            f"PG:host={POSTGRES_SERVER} port={POSTGRES_PORT} dbname={POSTGRES_TEST_DB} user={POSTGRES_USER} password={POSTGRES_PASSWORD}",
            os.path.join(FIXTURES_PATH, f"{layer}.geojson"),
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME)
def ks_demo_view_census_blocks_total_vap_fixture(session: Session):
    layer = GERRY_DB_TOTAL_VAP_FIXTURE_NAME
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            f"PG:host={POSTGRES_SERVER} port={POSTGRES_PORT} dbname={POSTGRES_TEST_DB} user={POSTGRES_USER} password={POSTGRES_PASSWORD}",
            os.path.join(FIXTURES_PATH, f"{layer}.geojson"),
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name=GERRY_DB_NO_POP_FIXTURE_NAME)
def ks_demo_view_census_blocks_no_pop_fixture(session: Session):
    layer = GERRY_DB_NO_POP_FIXTURE_NAME
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            f"PG:host={POSTGRES_SERVER} port={POSTGRES_PORT} dbname={POSTGRES_TEST_DB} user={POSTGRES_USER} password={POSTGRES_PASSWORD}",
            os.path.join(FIXTURES_PATH, f"{layer}.geojson"),
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="gerrydbtable")
def gerrydbtable_fixture(session: Session):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)
    session.begin()
    session.execute(upsert_query, {"name": GERRY_DB_FIXTURE_NAME})
    session.commit()


@pytest.fixture(name="second_gerrydbtable")
def second_gerrydbtable_fixture(session: Session):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)
    session.begin()
    session.execute(upsert_query, {"name": "bleh"})
    session.commit()


@pytest.fixture(name="document_id")
def document_fixture(client):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="document_id_total_vap")
def document_total_vap_fixture(client):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="document_no_gerrydb_id")
def document_no_gerrydb_fixture(client):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": None,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="document_no_gerrydb_pop")
def document_no_gerrydb_pop_fixture(client):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_NO_POP_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="assignments_document_id")
def assignments_fixture(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ]
        },
    )
    assert response.status_code == 200
    return document_id


@pytest.fixture(name="assignments_document_id_total_vap")
def assignments_total_vap_fixture(client, document_id_total_vap):
    document_id = document_id_total_vap
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ]
        },
    )
    assert response.status_code == 200
    return document_id


@pytest.fixture(name="assignments_document_no_gerrydb_id")
def assignments_no_gerrydb_fixture(client, document_no_gerrydb_id):
    document_id = document_no_gerrydb_id
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ]
        },
    )
    assert response.status_code == 200
    return document_id


@pytest.fixture(name="assignments_document_no_gerrydb_pop_id")
def assignments_no_gerrydb_pop_fixture(client, document_no_gerrydb_pop):
    document_id = document_no_gerrydb_pop
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ]
        },
    )
    assert response.status_code == 200
    return document_id


def test_db_is_alive(client):
    response = client.get("/db_is_alive")
    assert response.status_code == 200
    assert response.json() == {"message": "DB is alive"}


def test_new_document(client):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_FIXTURE_NAME,
        },
    )
    assert response.status_code == 201
    data = response.json()
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("gerrydb_table") == GERRY_DB_FIXTURE_NAME


def test_get_document(client, document_id):
    response = client.get(f"/api/document/{document_id}")
    assert response.status_code == 200
    data = response.json()
    assert data.get("document_id") == document_id
    assert data.get("gerrydb_table") == GERRY_DB_FIXTURE_NAME
    assert data.get("updated_at")
    assert data.get("created_at")
    assert data.get("tiles_s3_path") is None


def test_patch_document(client, document_id):
    response = client.patch(
        f"/api/update_document/{document_id}",
        json={"gerrydb_table": "foo"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("document_id") == document_id
    assert data.get("gerrydb_table") == "foo"
    assert data.get("updated_at")


def test_patch_assignments(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"assignments_upserted": 3}


def test_patch_assignments_twice(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 0},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 0},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"assignments_upserted": 2}

    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 1},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"assignments_upserted": 2}
    # Check that the assignments were updated and not inserted
    doc_uuid = str(uuid.UUID(document_id))
    response = client.get(f"/api/get_assignments/{doc_uuid}")
    assert response.status_code == 200
    data = response.json()
    assert data is not None
    assert len(data) == 2
    assert data[0]["zone"] == 1
    assert data[0]["geo_id"] == "202090416004010"
    assert data[1]["zone"] == 1
    assert data[1]["geo_id"] == "202090434001003"


def test_get_document_population_totals(
    client, assignments_document_id, ks_demo_view_census_blocks
):
    doc_uuid = str(uuid.UUID(assignments_document_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 200
    data = result.json()
    assert data == [{"zone": 1, "total_pop": 67}, {"zone": 2, "total_pop": 130}]


def test_get_document_vap_totals(
    client, assignments_document_id_total_vap, ks_demo_view_census_blocks_total_vap
):
    doc_uuid = str(uuid.UUID(assignments_document_id_total_vap))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 200
    data = result.json()
    # Eventually should return `total_vap` instead of `total_pop`
    # But first should decide on how to handle metadata of returned metrics
    # in general case
    assert data == [{"zone": 1, "total_pop": 67}, {"zone": 2, "total_pop": 130}]


def test_get_document_population_totals_no_gerrydb_view(
    client, assignments_document_no_gerrydb_id
):
    doc_uuid = str(uuid.UUID(assignments_document_no_gerrydb_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 404
    assert result.json() == {"detail": f"Document with ID {doc_uuid} not found"}


def test_get_document_population_totals_no_gerrydb_pop_view(
    client, assignments_document_no_gerrydb_pop_id, ks_demo_view_census_blocks
):
    doc_uuid = str(uuid.UUID(assignments_document_no_gerrydb_pop_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 404
    assert result.json() == {"detail": "Population column not found in GerryDB view"}


def test_list_gerydb_views(client, gerrydbtable):
    response = client.get("/api/gerrydb/views")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == GERRY_DB_FIXTURE_NAME


def test_list_gerydb_views_limit(client, gerrydbtable):
    response = client.get("/api/gerrydb/views?limit=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


def test_list_gerydb_views_offset(client, gerrydbtable, second_gerrydbtable):
    response = client.get("/api/gerrydb/views?offset=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "bleh"


def test_list_gerydb_views_offset_and_limit(client, gerrydbtable, second_gerrydbtable):
    response = client.get("/api/gerrydb/views?offset=1&limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "bleh"
