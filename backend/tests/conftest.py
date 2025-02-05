import os
import pytest
from app.main import app, get_session
from fastapi.testclient import TestClient
from sqlalchemy.event import listens_for
from sqlmodel import create_engine, Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
import subprocess
from tests.constants import (
    POSTGRES_TEST_DB,
    TEARDOWN_TEST_DB,
    TEST_SQLALCHEMY_DATABASE_URI,
    TEST_POSTGRES_CONNECTION_STRING,
    FIXTURES_PATH,
    OGR2OGR_PG_CONNECTION_STRING,
    GERRY_DB_FIXTURE_NAME,
)
from app.constants import GERRY_DB_SCHEMA
from app.utils import create_districtr_map

client = TestClient(app)


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app, headers={"origin": "http://localhost:5173"})
    yield client
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


@pytest.fixture(name="persistent_session")
def session_with_persist_fixture(engine):
    with Session(engine, expire_on_commit=True) as session:
        yield session


# https://github.com/fastapi/sqlmodel/discussions/940
@pytest.fixture(name="session")
def session_fixture(engine):
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


@pytest.fixture(name=GERRY_DB_FIXTURE_NAME)
def ks_demo_view_census_blocks_fixture(session: Session):
    layer = GERRY_DB_FIXTURE_NAME
    subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            os.path.join(FIXTURES_PATH, f"{layer}.geojson"),
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
        gerrydb_table_name=GERRY_DB_FIXTURE_NAME,
        parent_layer_name=GERRY_DB_FIXTURE_NAME,
    )
    session.commit()


@pytest.fixture(name="document_id")
def document_fixture(client, ks_demo_view_census_blocks_districtrmap):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id
