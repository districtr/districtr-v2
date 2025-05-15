import pytest
from fastapi.testclient import TestClient
from tests.constants import FIXTURES_PATH, USER_ID


@pytest.fixture(name="assignments_document_id")
def assignments_fixture(client, document_id) -> str:
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090428002008", "zone": 1},
                {"document_id": document_id, "geo_id": "200979691001108", "zone": 2},
            ],
            "updated_at": "2023-01-01T00:00:00",
            "user_id": "b097794f-8eba-4892-84b5-ad0dd5931795",
        },
    )
    assert response.status_code == 200
    return document_id


@pytest.fixture(name="csv_result")
def csv_result_fixture(assignments_document_id, client: TestClient) -> str:
    with open(FIXTURES_PATH / "exports" / "zone_assignments_csv_export.csv") as f:
        return f.read()


def test_get_zone_assignments_csv_export(
    client: TestClient, assignments_document_id: str, csv_result: str
):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?format=CSV&limit=10&export_type=ZoneAssignments",
    )
    assert response.status_code == 200, response.json()
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.text == csv_result


@pytest.fixture(name="geojson_result")
def geojson_result_fixture(assignments_document_id, client: TestClient) -> str:
    with open(
        FIXTURES_PATH / "exports" / "zone_assignments_geojson_export.geojson"
    ) as f:
        return f.read()


def test_get_zone_assignments_geojon_export(
    client: TestClient, assignments_document_id: str, geojson_result: str
):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?format=GeoJSON&limit=10&export_type=ZoneAssignments",
    )

    assert response.status_code == 200, response.json()
    assert response.headers["content-type"] == "application/json"
    assert response.text == geojson_result, response.text


def test_get_unsupported_export_type(client: TestClient, assignments_document_id: str):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?format=CSV&limit=10&export_type=NiceSocks",
    )

    assert response.status_code == 400, response.json()
    assert response.json()["detail"] == "'NiceSocks' is not a valid DocumentExportType"


def test_get_unsupported_format_export(
    client: TestClient, assignments_document_id: str
):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?format=FlatGeobuf&limit=10",
    )

    assert response.status_code == 400, response.json()
    assert (
        response.json()["detail"] == "'FlatGeobuf' is not a valid DocumentExportFormat"
    )


def test_get_block_assignments_csv_export_no_child_layer_raise(
    client: TestClient, assignments_document_id: str
):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?format=CSV&limit=10&export_type=BlockZoneAssignments",
    )
    assert response.status_code == 400, response.json()
    assert response.json()["detail"].startswith(
        f"Child layer is NULL for document_id: {assignments_document_id}. Block-level queries are not supported"
    )


@pytest.fixture
def simple_child_geoids_document_id(
    client: TestClient, simple_shatterable_districtr_map: str
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": USER_ID,
        },
    )
    assert response.status_code == 201, response.json()
    document_id = response.json()["document_id"]
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "a", "zone": 1},
                {"document_id": document_id, "geo_id": "b", "zone": 1},
                {"document_id": document_id, "geo_id": "c", "zone": 2},
            ],
            "updated_at": "2023-01-01T00:00:00",
            "user_id": "b097794f-8eba-4892-84b5-ad0dd5931795",
        },
    )
    assert response.status_code == 200, response.json()

    return document_id


def test_get_block_assignments_csv_export(
    client: TestClient, simple_child_geoids_document_id: str
):
    document_id = simple_child_geoids_document_id
    response = client.get(
        f"/api/document/{document_id}/export?format=CSV&limit=10&export_type=BlockZoneAssignments",
    )
    assert response.status_code == 200, response.json()
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.text == "geo_id,zone\na,1\nb,1\nc,2\n"
