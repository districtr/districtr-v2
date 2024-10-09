import os
import pytest
from sqlmodel import Session

from app.main import get_session
from app.constants import GERRY_DB_SCHEMA
from sqlalchemy import text
import subprocess
import uuid
from tests.constants import (
    OGR2OGR_PG_CONNECTION_STRING,
    FIXTURES_PATH,
)
from app.utils import create_districtr_map


def test_read_main(client):
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
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )


@pytest.fixture(name="ks_demo_view_census_blocks_districtrmap")
def ks_demo_view_census_blocks_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks_total_vap: None
):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)

    session.begin()
    session.execute(upsert_query, {"name": GERRY_DB_FIXTURE_NAME})
    create_districtr_map(
        session=session,
        name=f"Districtr map {GERRY_DB_FIXTURE_NAME}",
        gerrydb_table_name=GERRY_DB_FIXTURE_NAME,
        parent_layer_name=GERRY_DB_FIXTURE_NAME,
    )
    session.commit()


@pytest.fixture(name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME)
def ks_demo_view_census_blocks_total_vap_fixture(session: Session):
    layer = GERRY_DB_TOTAL_VAP_FIXTURE_NAME
    subprocess.run(
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


@pytest.fixture(name="ks_demo_view_census_total_vap_blocks_districtrmap")
def ks_demo_view_census_blocks_total_vap_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks_total_vap: None
):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)

    session.begin()
    session.execute(upsert_query, {"name": GERRY_DB_TOTAL_VAP_FIXTURE_NAME})
    create_districtr_map(
        session=session,
        name=f"Districtr map {GERRY_DB_TOTAL_VAP_FIXTURE_NAME}",
        gerrydb_table_name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        parent_layer_name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
    )
    session.commit()


@pytest.fixture(name=GERRY_DB_NO_POP_FIXTURE_NAME)
def ks_demo_view_census_blocks_no_pop_fixture(session: Session):
    layer = GERRY_DB_NO_POP_FIXTURE_NAME
    subprocess.run(
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


@pytest.fixture(name="ks_demo_view_census_no_pop_blocks_districtrmap")
def ks_demo_view_census_blocks_no_pop_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks_no_pop: None
):
    upsert_query = text("""
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """)

    session.begin()
    session.execute(upsert_query, {"name": GERRY_DB_NO_POP_FIXTURE_NAME})
    create_districtr_map(
        session=session,
        name=f"Districtr map {GERRY_DB_NO_POP_FIXTURE_NAME}",
        gerrydb_table_name=GERRY_DB_NO_POP_FIXTURE_NAME,
        parent_layer_name=GERRY_DB_NO_POP_FIXTURE_NAME,
    )
    session.commit()


@pytest.fixture(name="districtr_maps")
def districtr_map_fixtures(
    session: Session, ks_demo_view_census_blocks_districtrmap: None
):
    for i in range(4):
        create_districtr_map(
            session=session,
            name=f"Districtr map {i}",
            gerrydb_table_name=f"districtr_map_{i}",
            parent_layer_name=GERRY_DB_FIXTURE_NAME,
        )
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


def test_setup(
    client,
    districtr_maps,
    ks_demo_view_census_blocks_districtrmap,
    ks_demo_view_census_total_vap_blocks_districtrmap,
    ks_demo_view_census_no_pop_blocks_districtrmap,
):
    """
    This is a really ugly way of setting up fixtures that can result in
    integrity errors due esp. from unique violations.

    TODO: Really we should run all tests in rollbacked transactions so the dev
    doesn't need to think about the global state of the database between tests.
    """
    pass


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
    # assert data.get("tiles_s3_path") is None


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


def test_patch_assignments_nulls(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": None},
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


def test_get_document_population_totals_null_assignments(
    client, document_id, ks_demo_view_census_blocks
):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": None},
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"assignments_upserted": 3}
    doc_uuid = str(uuid.UUID(document_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 200
    data = result.json()
    assert data == [{"zone": 1, "total_pop": 67}]


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


def test_get_document_population_totals_no_gerrydb_pop_view(
    client, assignments_document_no_gerrydb_pop_id, ks_demo_view_census_blocks
):
    doc_uuid = str(uuid.UUID(assignments_document_no_gerrydb_pop_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 404
    assert result.json() == {"detail": "Population column not found in GerryDB view"}


def test_list_gerydb_views(client):
    response = client.get("/api/gerrydb/views")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 7


def test_list_gerydb_views_limit(client):
    response = client.get("/api/gerrydb/views?limit=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


def test_list_gerydb_views_offset(client):
    response = client.get("/api/gerrydb/views?offset=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 6


def test_list_gerydb_views_offset_and_limit(client):
    response = client.get("/api/gerrydb/views?offset=1&limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
