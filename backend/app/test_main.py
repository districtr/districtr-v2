import os
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from app.main import app, get_session
from pydantic_core import MultiHostUrl
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
import subprocess


client = TestClient(app)

ENVIRONMENT = os.environ.get("ENVIRONMENT")
POSTGRES_TEST_DB = "districtr_test"
POSTGRES_SCHEME = "postgresql+psycopg"
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_SERVER = os.environ.get("POSTGRES_SERVER", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", 5432)

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

    if ENVIRONMENT != "test":
        subprocess.run(["alembic", "upgrade", "head"], check=True, env=my_env)

    def teardown():
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


def test_db_is_alive(client):
    response = client.get("/db_is_alive")
    assert response.status_code == 200
    assert response.json() == {"message": "DB is alive"}
