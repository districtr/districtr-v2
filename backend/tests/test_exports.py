import pytest
from fastapi.testclient import TestClient
from datetime import datetime


@pytest.fixture(name="assignments_document_id")
def assignments_fixture(client, document_id) -> str:
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 1],
                ["200979691001108", 2],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200
    return document_id


def test_get_unsupported_export_type(client: TestClient, assignments_document_id: str):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?export_type=NiceSocks",
    )

    assert response.status_code == 400, response.json()
    assert response.json()["detail"] == "'NiceSocks' is not a valid DocumentExportType"


def test_get_block_assignments_csv_export_no_child_layer(
    client: TestClient, assignments_document_id: str
):
    response = client.get(
        f"/api/document/{assignments_document_id}/export?export_type=BlockAssignmentsCSV",
    )
    assert response.status_code == 200, response.json()
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    lines = response.text.strip().splitlines()
    assert lines[0] == "geo_id,zone"
    assert len(lines) == 4  # header + 3 assignments


@pytest.fixture
def simple_child_geoids_document_id(
    client: TestClient, simple_shatterable_districtr_map: str
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
        },
    )
    assert response.status_code == 201, response.json()
    document_id = response.json()["document_id"]
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["000010000000001", 1],
                ["000010000000002", 1],
                ["000010000000003", 2],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200, response.json()

    return document_id


def test_get_block_assignments_csv_export(
    client: TestClient,
    simple_child_geoids_document_id: str,
    mock_grid_graph_file,
):
    document_id = simple_child_geoids_document_id
    response = client.get(
        f"/api/document/{document_id}/export?export_type=BlockAssignmentsCSV",
    )
    assert response.status_code == 200, response.json()
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        response.text
        == "geo_id,zone\n000010000000001,1\n000010000000002,1\n000010000000003,2\n"
    )
