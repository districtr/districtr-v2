import os
from pathlib import Path
from tests.utils import string_to_bool
from pydantic_core import MultiHostUrl


FIXTURES_PATH = Path(__file__).parent / "fixtures"


ENVIRONMENT = os.environ.get("ENVIRONMENT")
POSTGRES_TEST_DB = os.environ.get("POSTGRES_TEST_DB", "districtr_test")
POSTGRES_SCHEME = "postgresql+psycopg"
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_SERVER = os.environ.get("POSTGRES_SERVER", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", 5432)
TEARDOWN_TEST_DB = string_to_bool(os.environ.get("TEARDOWN_TEST_DB", "true"))

TEST_SQLALCHEMY_DATABASE_URI = MultiHostUrl.build(
    scheme=POSTGRES_SCHEME,
    username=POSTGRES_USER,
    host=POSTGRES_SERVER,
    port=int(POSTGRES_PORT),
    path=POSTGRES_TEST_DB,
    password=POSTGRES_PASSWORD,
)

TEST_POSTGRES_CONNECTION_STRING = f"{POSTGRES_SCHEME}://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}/postgres"
OGR2OGR_PG_CONNECTION_STRING = f"PG:host={POSTGRES_SERVER} port={POSTGRES_PORT} dbname={POSTGRES_TEST_DB} user={POSTGRES_USER} password={POSTGRES_PASSWORD}"

GERRY_DB_FIXTURE_NAME = "ks_demo_view_census_blocks"
