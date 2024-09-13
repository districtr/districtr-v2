import os
import pytest
from sqlmodel import create_engine, Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
import subprocess
from tests.constants import (
    POSTGRES_TEST_DB,
    TEARDOWN_TEST_DB,
    TEST_SQLALCHEMY_DATABASE_URI,
    TEST_POSTGRES_CONNECTION_STRING,
)

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
    with Session(engine, expire_on_commit=True) as session:
        yield session
