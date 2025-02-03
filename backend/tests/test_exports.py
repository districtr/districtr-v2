import pytest
from fastapi.testclient import TestClient
from tests.constants import FIXTURES_PATH


@pytest.fixture(name="assignments_document_id")
def assignments_fixture(client, document_id) -> str:
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


@pytest.fixture(name="csv_result")
def csv_result_fixture(assignments_document_id, client: TestClient) -> str:
    with open(FIXTURES_PATH / "zone_assignments_csv_export.csv") as f:
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
    with open(FIXTURES_PATH / "zone_assignments_geojson_export.geojson") as f:
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
