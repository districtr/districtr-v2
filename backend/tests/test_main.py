import os
import pytest
from sqlmodel import Session
from app.core.db import get_session
from app.constants import GERRY_DB_SCHEMA
from sqlalchemy import text
import subprocess
import uuid
from tests.constants import (
    OGR2OGR_PG_CONNECTION_STRING,
    FIXTURES_PATH,
    GERRY_DB_FIXTURE_NAME,
    USER_ID,
)
from app.utils import (
    create_districtr_map
)
from app.models import DocumentEditStatus, DocumentShareStatus
import jwt
from app.core.config import settings
from fastapi import Form


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
GERRY_DB_TOTPOP_FIXTURE_NAME = "ks_demo_view_census_blocks_summary_stats"
GERRY_DB_VAP_FIXTURE_NAME = "ks_demo_view_census_blocks_summary_stats_vap"
GERRY_DB_ALL_FIXTURE_NAME = "ks_demo_view_census_blocks_summary_stats_all_stats"

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
        districtr_map_slug=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        gerrydb_table_name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        parent_layer=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
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
        districtr_map_slug=GERRY_DB_NO_POP_FIXTURE_NAME,
        gerrydb_table_name=GERRY_DB_NO_POP_FIXTURE_NAME,
        parent_layer=GERRY_DB_NO_POP_FIXTURE_NAME,
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
            districtr_map_slug=f"districtr_map_{i}",
            gerrydb_table_name=f"districtr_map_{i}",
            parent_layer=GERRY_DB_FIXTURE_NAME,
        )
    session.commit()


@pytest.fixture(name="document_id_total_vap")
def document_total_vap_fixture(
    client, ks_demo_view_census_total_vap_blocks_districtrmap
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )

    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="document_id_all_stats")
def document_all_stats_fixture(
    client, ks_demo_view_census_blocks_summary_stats_all_stats
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_ALL_FIXTURE_NAME,
            "user_id": USER_ID,
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
            "districtr_map_slug": GERRY_DB_NO_POP_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json()["document_id"]
    return document_id


@pytest.fixture(name="assignments_document_id")
def assignments_fixture(client, document_id_all_stats):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {
                    "document_id": document_id_all_stats,
                    "geo_id": "202090441022004",
                    "zone": 1,
                },
                {
                    "document_id": document_id_all_stats,
                    "geo_id": "202090428002008",
                    "zone": 1,
                },
                {
                    "document_id": document_id_all_stats,
                    "geo_id": "200979691001108",
                    "zone": 2,
                },
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200
    return document_id_all_stats


@pytest.fixture(name="assignments_document_id_total_vap")
def assignments_total_vap_fixture(client, document_id_total_vap):
    document_id = document_id_total_vap
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090428002008", "zone": 1},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": 2},
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
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090428002008", "zone": 1},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": 2},
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
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == GERRY_DB_FIXTURE_NAME


def test_get_document(client, document_id):
    doc_uuid = uuid.UUID(document_id)
    payload = {
        "user_id": USER_ID,
        "gerrydb_table": GERRY_DB_FIXTURE_NAME,
    }

    response = client.post(f"/api/document/{doc_uuid}", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data.get("document_id") == document_id
    assert data.get("districtr_map_slug") == GERRY_DB_FIXTURE_NAME
    assert data.get("updated_at")
    assert data.get("created_at")
    assert data.get("status") in ["locked", "unlocked", "checked_out"]

    # assert data.get("tiles_s3_path") is None


def test_patch_assignments(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090428002008", "zone": 1},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": 2},
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
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090428002008", "zone": 1},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": None},
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
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 0},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": 0},
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
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": 1},
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
    assert data[0]["geo_id"] == "202090441022004"
    assert data[1]["zone"] == 1
    assert data[1]["geo_id"] == "200979691001108"


def test_patch_reset_assignments(client, document_id):
    test_patch_assignments(client, document_id)
    response = client.patch(f"/api/update_assignments/{document_id}/reset")
    assert response.status_code == 200
    assignments = client.get(f"/api/get_assignments/{document_id}")
    assert assignments.status_code == 200
    assert len(assignments.json()) == 0


def test_get_document_population_totals_null_assignments(
    client, document_id_all_stats, ks_demo_view_census_blocks
):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {
                    "document_id": document_id_all_stats,
                    "geo_id": "202090441022004",
                    "zone": 1,
                },
                {
                    "document_id": document_id_all_stats,
                    "geo_id": "202090428002008",
                    "zone": 1,
                },
                {
                    "document_id": document_id_all_stats,
                    "geo_id": "200979691001108",
                    "zone": None,
                },
            ],
            "updated_at": "2023-01-01T00:00:00",
        },
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert data.get("assignments_upserted") == 3
    assert data.get("updated_at") is not None
    doc_uuid = str(uuid.UUID(document_id_all_stats))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 200, result.json()
    data = result.json()
    assert data == [{"zone": 1, "total_pop": 43}]


def test_get_document_population_totals(
    client, assignments_document_id, ks_demo_view_census_blocks
):
    doc_uuid = str(uuid.UUID(assignments_document_id))
    result = client.get(f"/api/document/{doc_uuid}/total_pop")
    assert result.status_code == 200
    data = result.json()
    assert data == [{"zone": 1, "total_pop": 43}, {"zone": 2, "total_pop": 13}]


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
    data = result.json()
    assert result.status_code == 404, data
    assert data == {"detail": "Population column not found in GerryDB view"}


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
            districtr_map_slug=f"districtr_map_{i}",
            gerrydb_table_name=f"districtr_map_{i}",
            parent_layer=GERRY_DB_FIXTURE_NAME,
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
    assert not result.visible
    assert data[0]["name"] == "Districtr map ks_demo_view_census_blocks"


@pytest.fixture(name=GERRY_DB_TOTPOP_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats(session: Session):
    layer = GERRY_DB_TOTPOP_FIXTURE_NAME
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

    districtr_map_uuid = create_districtr_map(
        session=session,
        name="DistrictMap with TOTPOP view",
        parent_layer=layer,
        districtr_map_slug=layer,
        gerrydb_table_name=layer,
    )

    session.commit()

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name=GERRY_DB_VAP_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats_vap(session: Session):
    layer = GERRY_DB_VAP_FIXTURE_NAME
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

    districtr_map_uuid = create_districtr_map(
        session=session,
        name="DistrictMap with VAP view",
        parent_layer=layer,
        districtr_map_slug=layer,
        gerrydb_table_name=layer,
    )
    session.commit()

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


@pytest.fixture(name=GERRY_DB_ALL_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats_all_stats(session: Session):
    layer = GERRY_DB_ALL_FIXTURE_NAME
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

    districtr_map_uuid = create_districtr_map(
        session=session,
        name="DistrictMap with TOTPOP AND VAP view",
        parent_layer=layer,
        districtr_map_slug=layer,
        gerrydb_table_name=layer,
        num_districts=4,
    )
    session.commit()

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")

def test_change_colors(
    client, document_id_all_stats, ks_demo_view_census_blocks_summary_stats_all_stats
):
    response = client.patch(
        f"/api/document/{document_id_all_stats}/update_colors",
        json=["#FF0001", "#FF0002", "#FF0003", "#FF0004"],
    )

    assert response.status_code == 200
    assert "colors" in response.json()
    assert response.json()["colors"] == ["#FF0001", "#FF0002", "#FF0003", "#FF0004"]


def test_change_colors_error(
    client, document_id_all_stats, ks_demo_view_census_blocks_summary_stats_all_stats
):
    response = client.patch(
        f"/api/document/{document_id_all_stats}/update_colors", json=["#FF0001"]
    )

    assert response.status_code == 400
    assert "detail" in response.json()
    assert (
        response.json()["detail"]
        == "Number of colors provided (1) does not match number of zones (4)"
    )


def test_update_districtrmap_metadata(client, document_id):
    metadata_payload = {
        "name": "Test Map",
        "tags": ["test", "map"],
        "description": "This is a test metadata entry",
        "event_id": "1234",
    }

    response = client.put(
        f"/api/document/{document_id}/metadata", json=metadata_payload
    )

    assert response.status_code == 200


def test_share_districtr_plan(client, document_id):
    """Test sharing a document when a pw exists"""
    share_payload = {"password": "password", "access_type": "view"}

    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "token" in data

    decoded_token = jwt.decode(data["token"], settings.SECRET_KEY, algorithms=["HS256"])
    assert decoded_token["access"] == "view"
    assert decoded_token["password_required"]

    # test sharing from an existing token
    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )

    assert response.status_code == 200
    assert "token" in data


def test_unlock_map(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")
    # unlock document
    response = client.post(
        f"/api/document/{document_id}/unlock", json={"user_id": USER_ID}
    )
    assert response.status_code == 200


def test_get_document_status(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # check doc status
    response = client.post(
        f"/api/document/{document_id}/status", json={"user_id": USER_ID}
    )
    document_status = response.json().get("status")

    assert (
        document_status == DocumentEditStatus.checked_out
    )  # since it was made fresh by this user


def test_document_unload(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # unload document
    response = client.post(
        f"/api/document/{document_id}/unload",
        data={"user_id": Form(USER_ID)},
    )

    assert response.status_code == 200
    assert response.json().get("status") == DocumentEditStatus.unlocked


def test_load_plan_from_share(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # share the document
    share_payload = {"password": "password", "access_type": "view"}

    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )
    decoded_token = jwt.decode(
        response.json()["token"], settings.SECRET_KEY, algorithms=["HS256"]
    )

    # load the document
    response = client.post(
        "/api/share/load_plan_from_share",
        json={
            "user_id": USER_ID,
            "password": "password",
            "token": decoded_token["token"],
            "access": DocumentShareStatus.read,
        },
    )

    assert response.status_code == 200


def test_document_checkout(client, document_id):
    # create a document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # share the document
    share_payload = {"password": "password", "access_type": "view"}

    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )
    decoded_token = jwt.decode(
        response.json()["token"], settings.SECRET_KEY, algorithms=["HS256"]
    )

    # chck the document out
    response = client.post(
        f"/api/document/{document_id}/checkout",
        json={
            "user_id": USER_ID,
            "password": "password",
            "token": decoded_token["token"],
        },
    )

    assert response.status_code == 200
    assert response.json().get("status") == DocumentEditStatus.checked_out
