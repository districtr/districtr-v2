import os
from pymongo.results import InsertOneResult
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from app.main import app, get_session
from app.core.db import get_mongo_database
from pydantic_core import MultiHostUrl
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
import subprocess


client = TestClient(app)

POSTGRES_TEST_DB = "districtr_test"
POSTGRES_TEST_SCHEME = "postgresql+psycopg"
POSTGRES_TEST_USER = "postgres"
POSTGRES_TEST_HOST = "localhost"
POSTGRES_TEST_PORT = 5432

my_env = os.environ.copy()

my_env["POSTGRES_DB"] = POSTGRES_TEST_DB
my_env["POSTGRES_SCHEME"] = POSTGRES_TEST_SCHEME
my_env["POSTGRES_USER"] = POSTGRES_TEST_USER
my_env["POSTGRES_SERVER"] = POSTGRES_TEST_HOST
my_env["POSTGRES_PORT"] = str(POSTGRES_TEST_PORT)

TEST_SQLALCHEMY_DATABASE_URI = MultiHostUrl.build(
    scheme=POSTGRES_TEST_SCHEME,
    username=POSTGRES_TEST_USER,
    host=POSTGRES_TEST_HOST,
    port=POSTGRES_TEST_PORT,
    path=POSTGRES_TEST_DB,
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


@pytest.fixture(scope="session", autouse=True, name="engine")
def engine_fixture(request):
    _engine = create_engine("postgresql://postgres@/postgres")
    conn = _engine.connect()
    conn.execute(text("commit"))
    try:
        conn.execute(text(f"CREATE DATABASE {POSTGRES_TEST_DB}"))
    except (OperationalError, ProgrammingError):
        pass

    subprocess.run(["alembic", "upgrade", "head"], check=True, env=my_env)

    def teardown():
        conn.execute(text(f"DROP DATABASE {POSTGRES_TEST_DB}"))
        conn.close()

    request.addfinalizer(teardown)


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(str(TEST_SQLALCHEMY_DATABASE_URI), echo=True)
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


@pytest.fixture(name="plan")
def plan_id_fixture() -> InsertOneResult:
    db = get_mongo_database()
    return db.plans.insert_one({"assignments": {"06067001101": 1}})


def test_get_plan(client: TestClient, plan: InsertOneResult):
    response = client.get(f"/plan/{plan.inserted_id}")
    assert response.status_code == 200


def test_create_plan(client: TestClient):
    response = client.post("/plan", json={"assignments": {"06067001101": 1}})
    assert response.status_code == 201


def test_update_add_to_plan(client: TestClient, plan: InsertOneResult):
    response = client.put(
        f"/plan/{plan.inserted_id}", json={"assignments": {"06067001102": 1}}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["modified_count"] == 1
    assert data["upserted_id"] is None


def test_update_update_and_add(client: TestClient, plan: InsertOneResult):
    response = client.put(
        f"/plan/{plan.inserted_id}",
        json={"assignments": {"06067001101": 2, "06067001102": 1}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["modified_count"] == 1
    assert data["matched_count"] == 1
    assert data["acknowledged"] is True
    assert data["upserted_id"] is None


def test_get_missing_plan(client: TestClient):
    response = client.get("/plan/6680e7d8b65f636e1a966c3e")
    data = response.json()
    assert response.status_code == 404
    assert data["detail"] == "Plan not found"
