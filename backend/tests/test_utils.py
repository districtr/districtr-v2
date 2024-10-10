import pytest
import os
from app.utils import (
    create_districtr_map,
    create_shatterable_gerrydb_view,
    create_parent_child_edges,
)
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
            os.path.join(FIXTURES_PATH, f"{layer}.geojson"),
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
        parent_layer_name="simple_parent_geos",
        child_layer_name="simple_child_geos",
        gerrydb_table_name="simple_geos",
    )
    session.commit()
    return


@pytest.fixture(name="districtr_map")
def districtr_map_fixture(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    (inserted_districtr_map,) = create_districtr_map(
        session,
        name="Simple shatterable layer",
        gerrydb_table_name="simple_geos",
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer_name="simple_parent_geos",
        child_layer_name="simple_child_geos",
    )
    session.commit()
    return inserted_districtr_map


# FOR THE TESTS BELOW I NEED TO ADD ACTUAL ASSERTIONS


def test_create_districtr_map(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    (inserted_districtr_map,) = create_districtr_map(
        session,
        name="Simple shatterable layer",
        gerrydb_table_name="simple_geos_test",
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer_name="simple_parent_geos",
        child_layer_name="simple_child_geos",
    )
    session.commit()


def test_create_districtr_map_some_nulls(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    # This is also an example of a districtr map before other set-up operations
    # are performed, such as creating a tileset and a shatterable view
    (inserted_districtr_map,) = create_districtr_map(
        session,
        name="Simple non-shatterable layer",
        gerrydb_table_name="simple_parent_geos_some_nulls",
        parent_layer_name="simple_parent_geos",
    )
    session.commit()


def test_create_shatterable_gerrydb_view(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    create_shatterable_gerrydb_view(
        session,
        parent_layer_name="simple_parent_geos",
        child_layer_name="simple_child_geos",
        gerrydb_table_name="simple_geos_test",
    )
    session.commit()


def test_create_parent_child_edges(
    session: Session, districtr_map: str, gerrydb_simple_geos_view
):
    create_parent_child_edges(session=session, districtr_map_uuid=districtr_map)
    session.commit()


def test_shattering(client):
    # Set-up
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": "simple_geos",
        },
    )
    assert response.status_code == 201
    doc = response.json()
    document_id = doc["document_id"]

    response = client.patch(
        "/api/update_assignments",
        json={"assignments": [{"document_id": document_id, "geo_id": "A", "zone": 1}]},
    )
    assert response.status_code == 200

    # Test
    response = client.patch(
        f"/api/update_assignments/{document_id}/shatter_parents", json={"geoids": ["A"]}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"]["geoids"][0] == "A"
    assert len(data["children"]) == 2
    assert len({d["document_id"] for d in data["children"]}) == 1
    assert {d["geo_id"] for d in data["children"]} == {"a", "e"}
    assert all(d["zone"] == 1 for d in data["children"])
