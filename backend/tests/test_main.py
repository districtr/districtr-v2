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
    GERRY_DB_FIXTURE_NAME,
)
from app.utils import create_districtr_map, add_available_summary_stats_to_districtrmap


def test_read_main(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}


def test_get_session():
    session = get_session()
    assert session is not None
    for s in session:
        assert isinstance(s, Session)


GERRY_DB_TOTAL_VAP_FIXTURE_NAME = "ks_demo_view_census_blocks_total_vap"
GERRY_DB_NO_POP_FIXTURE_NAME = "ks_demo_view_census_blocks_no_pop"
GERRY_DB_P1_FIXTURE_NAME = "ks_demo_view_census_blocks_summary_stats"
GERRY_DB_P4_FIXTURE_NAME = "ks_demo_view_census_blocks_summary_stats_p4"


## Test DB


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
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )


@pytest.fixture(name="ks_demo_view_census_total_vap_blocks_districtrmap")
def ks_demo_view_census_blocks_total_vap_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks_total_vap: None
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
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )


@pytest.fixture(name="ks_demo_view_census_no_pop_blocks_districtrmap")
def ks_demo_view_census_blocks_no_pop_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks_no_pop: None
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


@pytest.fixture(name="document_id_total_vap")
def document_total_vap_fixture(
    client, ks_demo_view_census_total_vap_blocks_districtrmap
):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="document_no_gerrydb_pop")
def document_no_gerrydb_pop_fixture(
    client, ks_demo_view_census_no_pop_blocks_districtrmap
):
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
            ],
            "updated_at": "2023-01-01T00:00:00",
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
            ],
            "updated_at": "2023-01-01T00:00:00",
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
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    return document_id


def test_db_is_alive(client):
    response = client.get("/db_is_alive")
    assert response.status_code == 200
    assert response.json() == {"message": "DB is alive"}


def test_new_document(client, ks_demo_view_census_blocks_districtrmap):
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
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    assert response.json().get("assignments_upserted") == 3
    updated_at = response.json().get("updated_at")
    assert updated_at is not None


def test_patch_assignments_nulls(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": None},
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("assignments_upserted") == 3
    assert data.get("updated_at") is not None


def test_patch_assignments_twice(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 0},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 0},
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("assignments_upserted") == 2
    assert data.get("updated_at") is not None

    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 1},
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    assert data.get("assignments_upserted") == 2
    assert data.get("updated_at") is not None
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


def test_patch_reset_assignments(client, document_id):
    test_patch_assignments(client, document_id)
    response = client.patch(f"/api/update_assignments/{document_id}/reset")
    assert response.status_code == 200
    assignments = client.get(f"/api/get_assignments/{document_id}")
    assert assignments.status_code == 200
    assert len(assignments.json()) == 0


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
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("assignments_upserted") == 3
    assert data.get("updated_at") is not None
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
    assert result.status_code == 404
    assert result.json() == {"detail": "Population column not found in GerryDB view"}


def test_get_document_population_totals_no_gerrydb_pop_view(
    client, assignments_document_no_gerrydb_pop_id, ks_demo_view_census_blocks
):
    doc_uuid = str(uuid.UUID(assignments_document_no_gerrydb_pop_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 404
    assert result.json() == {"detail": "Population column not found in GerryDB view"}


def test_list_gerydb_views(client, districtr_maps):
    response = client.get("/api/gerrydb/views")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5


def test_list_gerydb_views_limit(client, districtr_maps):
    response = client.get("/api/gerrydb/views?limit=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


def test_list_gerydb_views_offset(client, districtr_maps):
    response = client.get("/api/gerrydb/views?offset=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4


def test_list_gerydb_views_offset_and_limit(client, districtr_maps):
    response = client.get("/api/gerrydb/views?offset=1&limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


@pytest.fixture(name="districtr_maps_soft_deleted")
def districtr_map_soft_deleted_fixture(
    session: Session, ks_demo_view_census_blocks_districtrmap: None
):
    for i in range(2):
        create_districtr_map(
            session=session,
            name=f"Districtr map {i}",
            gerrydb_table_name=f"districtr_map_{i}",
            parent_layer_name=GERRY_DB_FIXTURE_NAME,
            visibility=bool(
                i
            ),  # Should have one hidden (index 0) and one visible (index 1)
        )
    session.commit()


def test_list_gerydb_views_soft_deleted_map(
    client, session, districtr_maps_soft_deleted
):
    response = client.get("/api/gerrydb/views")
    assert response.status_code == 200
    data = response.json()
    # One visible from `ks_demo_view_census_blocks_districtrmap`
    # One hidden from `districtr_maps_soft_deleted`
    # One visible from `districtr_maps_soft_deleted`
    assert len(data) == 2

    # Check that the hidden map is there
    stmt = text("SELECT * FROM districtrmap WHERE not visible")
    result = session.execute(stmt).one()
    assert result is not None
    assert not result[-1]  # visible column is False
    assert data[0]["name"] == "Districtr map ks_demo_view_census_blocks"


@pytest.fixture(name=GERRY_DB_P1_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats(session: Session):
    layer = GERRY_DB_P1_FIXTURE_NAME
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
            f"{GERRY_DB_SCHEMA}.{layer}",
        ],
    )

    upsert_query = text(
        """
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """
    )

    session.execute(upsert_query, {"name": layer})

    (districtr_map_uuid,) = create_districtr_map(
        session=session,
        name="DistrictMap with P1 view",
        parent_layer_name=layer,
        gerrydb_table_name=layer,
    )
    summary_stats = add_available_summary_stats_to_districtrmap(
        session=session, districtr_map_uuid=districtr_map_uuid
    )
    assert summary_stats == ["P1"], f"Expected P1 to be available, got {summary_stats}"

    session.commit()

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="document_id_p1_summary_stats")
def document_summary_stats_fixture(client, ks_demo_view_census_blocks_summary_stats):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_P1_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


def test_get_p1_summary_stats(client, document_id_p1_summary_stats):
    # Set up assignments
    document_id = document_id_p1_summary_stats
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )

    summary_stat = "P1"
    response = client.get(f"/api/document/{document_id}/evaluation/{summary_stat}")
    data = response.json()
    assert response.status_code == 200
    assert data.get("summary_stat") == "Population by Race"
    results = data.get("results")
    assert results is not None
    assert len(results) == 2
    record_1, record_2 = data.get("results")
    assert record_1.get("zone") == 1
    assert record_2.get("zone") == 2
    assert record_1.get("other_pop") == 13
    assert record_2.get("other_pop") == 24


@pytest.fixture(name=GERRY_DB_P4_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats_p4(session: Session):
    layer = GERRY_DB_P4_FIXTURE_NAME
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
            f"{GERRY_DB_SCHEMA}.{layer}",
        ],
    )

    upsert_query = text(
        """
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """
    )

    session.execute(upsert_query, {"name": layer})

    (districtr_map_uuid,) = create_districtr_map(
        session=session,
        name="DistrictMap with P4 view",
        parent_layer_name=layer,
        gerrydb_table_name=layer,
    )
    summary_stats = add_available_summary_stats_to_districtrmap(
        session=session, districtr_map_uuid=districtr_map_uuid
    )
    assert summary_stats == ["P4"], f"Expected P4 to be available, got {summary_stats}"

    session.commit()

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name="document_id_p4_summary_stats")
def document_p4_summary_stats_fixture(
    client, ks_demo_view_census_blocks_summary_stats_p4
):
    response = client.post(
        "/api/create_document",
        json={
            "gerrydb_table": GERRY_DB_P4_FIXTURE_NAME,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


def test_get_p4_summary_stats(client, document_id_p4_summary_stats):
    # Set up assignments
    document_id = str(document_id_p4_summary_stats)
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090416004010", "zone": 1},
                {"document_id": document_id, "geo_id": "202090416003004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090434001003", "zone": 2},
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )

    summary_stat = "P4"
    response = client.get(f"/api/document/{document_id}/evaluation/{summary_stat}")
    data = response.json()
    assert response.status_code == 200
    assert (
        data.get("summary_stat")
        == "Hispanic or Latino, and Not Hispanic or Latino by Race Voting Age Population"
    )
    results = data.get("results")
    assert results is not None
    assert len(results) == 2
    record_1, record_2 = data.get("results")
    assert record_1.get("zone") == 1
    assert record_2.get("zone") == 2
    assert record_1.get("hispanic_vap") == 13
    assert record_2.get("hispanic_vap") == 24
