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
from app.utils import create_districtr_map, create_map_group
from app.core.models import DocumentID
from pydantic import ValidationError
from tests.test_utils import handle_full_submission_approve, patch_recaptcha

REQUIRED_AUTO_FIXTURES = [patch_recaptcha]


def test_document_id_public_numeric_string():
    """Test that numeric strings are considered public documents."""
    doc_id = DocumentID(document_id="123")
    assert doc_id.is_public is True
    assert doc_id.value == 123


def test_document_id_public_integer_string():
    """Test that integer strings are considered public documents."""
    doc_id = DocumentID(document_id="456789")
    assert doc_id.is_public is True
    assert doc_id.value == 456789


def test_document_id_private_valid_uuid():
    """Test that valid UUIDs are accepted for private documents."""
    test_uuid = str(uuid.uuid4())
    doc_id = DocumentID(document_id=test_uuid)
    assert doc_id.is_public is False
    assert doc_id.value == test_uuid


def test_document_id_private_uuid_with_hyphens():
    """Test that standard UUID format with hyphens works."""
    test_uuid = "550e8400-e29b-41d4-a716-446655440000"
    doc_id = DocumentID(document_id=test_uuid)
    assert doc_id.is_public is False
    assert doc_id.value == test_uuid


def test_document_id_private_invalid_uuid():
    """Test that invalid UUIDs raise ValidationError for private documents."""
    with pytest.raises(ValidationError) as exc_info:
        DocumentID(document_id="not-a-valid-uuid")

    error_details = exc_info.value.errors()[0]
    assert "Private document_id must be a valid UUID" in error_details["msg"]


def test_document_id_empty():
    """Test that invalid UUIDs raise ValidationError for private documents."""
    with pytest.raises(ValidationError) as exc_info:
        DocumentID(document_id="")

    error_details = exc_info.value.errors()[0]
    assert "Private document_id must be a valid UUID" in error_details["msg"]


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
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
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
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
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
            group_slug="states",
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
            "user_id": USER_ID,
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
            "user_id": USER_ID,
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
            "user_id": USER_ID,
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
    response = client.get(f"/api/document/{doc_uuid}?user_id={USER_ID}")
    assert response.status_code == 200

    data = response.json()
    assert data.get("document_id") == document_id
    assert data.get("districtr_map_slug") == GERRY_DB_FIXTURE_NAME
    assert data.get("updated_at")
    assert data.get("created_at")


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
            "user_id": USER_ID,
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
            "user_id": USER_ID,
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
            "user_id": USER_ID,
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
            "user_id": USER_ID,
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


def test_list_gerydb_views(client, districtr_maps):
    response = client.get("/api/gerrydb/views")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4


def test_list_gerydb_views_limit(client, districtr_maps):
    response = client.get("/api/gerrydb/views?limit=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


def test_list_gerydb_views_offset(client, districtr_maps):
    response = client.get("/api/gerrydb/views?offset=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3


def test_list_gerydb_views_offset_and_limit(client, districtr_maps):
    response = client.get("/api/gerrydb/views?offset=1&limit=1")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


@pytest.fixture(name="map_group_two")
def map_group_two_fixture(session: Session):
    create_map_group(session=session, group_name="Map Group Two", slug="map_group_two")
    return "map_group_two"


@pytest.fixture(name="districtr_maps_diff_group")
def districtr_map_diff_group_fixtures(
    session: Session, map_group_two: str, ks_demo_view_census_blocks_districtrmap
):
    for i in range(4):
        create_districtr_map(
            session=session,
            name=f"Districtr map {i}",
            districtr_map_slug=f"districtr_map_{i}",
            gerrydb_table_name=f"districtr_map_{i}",
            parent_layer=GERRY_DB_FIXTURE_NAME,
            group_slug=map_group_two,
        )
    session.commit()


def test_list_gerydb_views_diff_map_group(client, districtr_maps_diff_group):
    response = client.get("/api/gerrydb/views?group=map_group_two")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4


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
            group_slug="states",
        )
    session.commit()


def test_list_gerydb_views_soft_deleted_map(
    client, session, districtr_maps_soft_deleted
):
    response = client.get("/api/gerrydb/views")
    assert response.status_code == 200
    data = response.json()
    # One hidden from `districtr_maps_soft_deleted`
    # One visible from `districtr_maps_soft_deleted`
    assert len(data) == 1

    # Check that the hidden map is there
    stmt = text("SELECT * FROM districtrmap WHERE not visible")
    result = session.execute(stmt).one()
    assert result is not None
    assert not result.visible
    assert data[0]["name"] == "Districtr map 1"


@pytest.fixture(name=GERRY_DB_TOTPOP_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats(session: Session):
    layer = GERRY_DB_TOTPOP_FIXTURE_NAME
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
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

    create_districtr_map(
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
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
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

    create_districtr_map(
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
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
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

    create_districtr_map(
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


def test_update_districtrmap_metadata_with_bad_metadata(client, document_id):
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={
            "name": "Test Map",  # Good metadata
            "bad_user": "injecting huge payload",  # Bad metadata
        },
    )
    assert response.status_code == 200

    response = client.get(f"/api/document/{document_id}")
    assert response.status_code == 200
    document = response.json()
    assert "bad_user" not in document["map_metadata"]


def test_group_data(client, session: Session):
    group_slug = "map_group_two"
    create_map_group(session=session, group_name="Map Group Two", slug=group_slug)
    response = client.get(f"/api/group/{group_slug}")
    assert response.json().get("name") == "Map Group Two"


def test_new_document_from_block_assignments(client, simple_shatterable_districtr_map):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["b", "2"],
                ["c", "2"],
                ["d", "2"],
                ["e", "1"],
                ["f", "3"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    # All parent geoids are inferrable
    assert data.get("inserted_assignments") == 3


def test_new_document_from_block_assignments_no_matched_parents(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["b", "2"],
                ["c", "1"],
                ["d", "2"],
                ["e", "2"],
                ["f", "1"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    # No parent geoids are inferrable
    assert data.get("inserted_assignments") == 6


def test_new_document_from_block_assignments_no_data(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    # No parent geoids are inferrable
    assert data.get("inserted_assignments") == 0


def test_new_document_from_block_assignments_some_matched_parents(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["b", "2"],
                ["c", "1"],
                ["d", "2"],
                ["e", "1"],
                ["f", "3"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    # Some parent geoids are inferrable
    assert data.get("inserted_assignments") == 5


def test_new_document_from_block_assignments_some_nulls(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["b", ""],
                ["c", "1"],
                ["d", ""],
                ["e", "1"],
                ["f", "3"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    assert data.get("inserted_assignments") == 3


def test_new_document_from_block_assignments_some_null_geoids(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["b", ""],
                ["", "1"],
                ["", ""],
                ["e", "1"],
                ["f", "3"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    assert data.get("inserted_assignments") == 2


def test_new_document_from_block_assignments_non_integer_mapping(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "My zone 1"],
                ["b", ""],
                ["c", "My zone 1"],
                ["d", ""],
                ["e", "My zone 1"],
                ["f", "My zone 3"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    assert data.get("inserted_assignments") == 3


def test_new_document_from_block_assignments_too_many_unique_zones(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["b", "2"],
                ["c", "3"],
                ["d", "4"],
                ["e", "1"],
                ["f", "5"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "simple_geos"
    # Maximum number of districts is three
    # - a + e => parent A
    # - b -> still valid so single block
    # - c -> still valid so single block
    # - d and f are skipped
    assert data.get("inserted_assignments") == 3


def test_new_document_from_block_assignments_no_children(
    client, ks_demo_view_census_blocks_districtrmap
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "ks_demo_view_census_blocks",
            "user_id": USER_ID,
            "assignments": [
                ["202090441022004", "1"],
                ["202090428002008", "1"],
                ["202090443032011", "2"],
                ["200979691001108", "3"],
            ],
        },
    )
    data = response.json()
    assert (
        response.status_code == 201
    ), f"Unexpected result: {response.status_code} {data.get('detail')}"
    document_id = data.get("document_id", None)
    assert document_id
    assert isinstance(uuid.UUID(document_id), uuid.UUID)
    assert data.get("districtr_map_slug") == "ks_demo_view_census_blocks"
    assert data.get("inserted_assignments") == 4


def test_new_document_from_block_assignments_duplicate_blocks_in_input(
    client, simple_shatterable_districtr_map
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
            "assignments": [
                ["a", "1"],
                ["a", "1"],  # Dupe!
                ["b", "2"],
                ["c", "1"],
                ["d", "2"],
                ["e", "2"],
                ["f", "1"],
            ],
        },
    )
    data = response.json()
    detail = data.get("detail")
    assert (
        response.status_code == 400
    ), f"Unexpected result: {response.status_code} {detail}"
    assert (
        detail == "Duplicate geoids found in input data. Ensure all geoids are unique"
    )


def test_document_list(
    client, session: Session, document_id_total_vap, document_id_all_stats
):
    response = client.get("/api/documents/list")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0].get("public_id")
    # use that ID later
    public_id = data[0].get("public_id")

    # limit 1
    response = client.get("/api/documents/list?limit=1")
    assert response.status_code == 200
    data = response.json()
    document_1 = data[0]
    assert len(data) == 1

    # offset 1
    response = client.get("/api/documents/list?offset=1&limit=1")
    assert response.status_code == 200
    data = response.json()
    document_2 = data[0]
    assert len(data) == 1
    # assert not equal previous data
    assert document_1.get("public_id") != document_2.get("public_id")

    # filter on tags "test"
    # update metadata to add tag "test"
    metadata_payload = {
        "name": "Test Map",
        "tags": ["test", "map"],
        "description": "This is a test metadata entry",
        "event_id": "1234",
        "draft_status": "ready_to_share",
    }

    response = client.put(
        f"/api/document/{document_id_total_vap}/metadata", json=metadata_payload
    )
    assert response.status_code == 200

    # submit a comment with tag "test"
    comment_data = {
        "commenter": {
            "first_name": "Test",
            "email": "test@example.com",
            "place": "Portland",
            "state": "OR",
        },
        "comment": {
            "title": "Test Comment",
            "comment": "This is a test comment with some content.",
            "document_id": document_id_total_vap,
        },
        "tags": [{"tag": "test"}],
        "recaptcha_token": "test_token",
    }
    response = client.post("/api/comments/submit", json=comment_data)
    assert response.status_code == 201
    handle_full_submission_approve(client, response.json())
    response = client.get("/api/documents/list?tags=test")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert "test" in data[0].get("map_metadata").get("tags")

    # filter on IDs
    # Use a real public_id from the data to ensure this works in all environments
    response = client.get(f"/api/documents/list?ids={public_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0].get("public_id") == public_id


def test_get_district_unions(client, document_id_total_vap):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {
                    "document_id": document_id_total_vap,
                    "geo_id": "202090441022004",
                    "zone": 1,
                },
                {
                    "document_id": document_id_total_vap,
                    "geo_id": "202090428002008",
                    "zone": 1,
                },
                {
                    "document_id": document_id_total_vap,
                    "geo_id": "200979691001108",
                    "zone": 2,
                },
            ],
            "user_id": USER_ID,
        },
    )
    response = client.get(f"/api/document/{document_id_total_vap}/stats")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0].get("zone")
    assert data[0].get("geometry")
    assert data[0].get("demographic_data")
    assert data[0].get("updated_at")
    # update assignments to re-generate stats
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {
                    "document_id": document_id_total_vap,
                    "geo_id": "200979691001108",
                    "zone": 1,
                },
            ],
            "user_id": USER_ID,
        },
    )
    response = client.get(f"/api/document/{document_id_total_vap}/stats")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1

    # get with public id
    document_info = client.get(f"/api/document/{document_id_total_vap}")
    response = client.get(
        f"/api/document/{document_info.json().get('public_id')}/stats"
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
