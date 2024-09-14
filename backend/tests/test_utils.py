import pytest
import os
from app.utils import create_districtr_map, create_shatterable_gerrydb_view
from sqlmodel import Session
import subprocess
from app.constants import GERRY_DB_SCHEMA
from tests.constants import OGR2OGR_PG_CONNECTION_STRING, FIXTURES_PATH
from sqlalchemy import text


@pytest.fixture(name="simple_parent_geos")
def simple_parent_geos_fixture(session: Session):
    layer = "simple_parent_geos"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
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


@pytest.fixture(name="simple_child_geos")
def simple_child_geos_fixture(session: Session):
    layer = "simple_child_geos"
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
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


def test_create_districtr_map(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    (new_map_uuid,) = create_districtr_map(
        session,
        name="Simple shatterable layer",
        gerrydb_table_name="simple_geos",
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer_name="simple_parent_geos",
        child_layer_name="simple_child_geos",
    )
    print("NEW MAP UUID", new_map_uuid)


def test_create_districtr_map_some_nulls(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    # This is also an example of a districtr map before other set-up operations
    # are performed, such as creating a tileset and a shatterable view
    (new_map_uuid,) = create_districtr_map(
        session,
        name="Simple non-shatterable layer",
        gerrydb_table_name="simple_parent_geos",
        parent_layer_name="simple_parent_geos",
    )
    print("NEW MAP UUID", new_map_uuid)


def test_create_shatterable_gerrydb_view(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    create_shatterable_gerrydb_view(
        session,
        parent_layer_name="simple_parent_geos",
        child_layer_name="simple_child_geos",
        gerrydb_table_name="simple_geos",
    )
    print("SHATTERABLE VIEW CREATED")
