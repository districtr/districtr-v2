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


@pytest.fixture(scope="session", name="ks_demo_view_census_blocks")
def ks_demo_view_census_blocks_fixture():
    layer = "ks_demo_view_census_blocks"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            f"PG:host={POSTGRES_SERVER} port={POSTGRES_PORT} dbname={POSTGRES_TEST_DB} user={POSTGRES_USER} password={POSTGRES_PASSWORD}",
            os.path.join(FIXTURES_PATH, "ks_demo_view_census_blocks.geojson"),
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="document_id")
def document_fixture(client):
    response = client.post("/create_document")
    assert response.status_code == 201
    document_id = response.json().get("document_id", None)
    assert document_id is not None
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    return document_id.replace("-", "")


@pytest.fixture(name="assignments_document_id")
def assignments_fixture(client, document_id):
    response = client.patch(
        "/update_assignments",
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
    response = client.post("/create_document")
    assert response.status_code == 201
    document_id = response.json().get("document_id", None)
    assert document_id is not None
    assert isinstance(uuid.UUID(document_id), uuid.UUID)


def test_patch_assignments(client, document_id):
    response = client.patch(
        "/update_assignments",
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
        "/update_assignments",
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
        "/update_assignments",
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
    print("DOC UUID", doc_uuid)
    response = client.get(f"/get_assignments/{doc_uuid}")
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
    # TODO: Need to figure out how to not have to do this every time...!
    doc_uuid = str(uuid.UUID(assignments_document_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 200
    data = result.json()
    assert data == [{"zone": 1, "total_pop": 67}, {"zone": 2, "total_pop": 130}]
