import os
import pytest
from tests.constants import FIXTURES_PATH
from unittest.mock import patch


@pytest.fixture
def document_id_with_assignments(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [
                {
                    "document_id": document_id,
                    "geo_id": "202090441022004",
                    "zone": 1,
                },
                {
                    "document_id": document_id,
                    "geo_id": "202090428002008",
                    "zone": 1,
                },
                {
                    "document_id": document_id,
                    "geo_id": "202090443032011",
                    "zone": 1,
                },
                {
                    "document_id": document_id,
                    "geo_id": "200979691001108",
                    "zone": 2,
                },
            ]
        },
    )
    assert response.status_code == 200

    return document_id


def test_thumbnail_generator(client, document_id_with_assignments):
    with patch(
        "app.thumbnails.main.get_document_thumbnail_file_path"
    ) as mock_generate_thumbnail:
        document_id = document_id_with_assignments
        out_path = f"{FIXTURES_PATH}/{document_id}.png"
        mock_generate_thumbnail.return_value = out_path

        response = client.post(
            f"/api/document/{document_id}/thumbnail",
        )
        assert response.status_code == 200
        assert (
            response.json().get("message") == "Generating thumbnail in background task"
        )

        mock_generate_thumbnail.assert_called_once()
        assert os.path.exists(out_path)
        assert os.stat(out_path).st_size > 0
        os.remove(out_path)


def test_thumbnail_cdn_redirect(client, document_id):
    with patch("app.thumbnails.main.file_exists", return_value=True):
        response = client.get(
            f"/api/document/{document_id}/thumbnail",
            follow_redirects=False,
        )
        assert response.status_code == 307
        assert f"/thumbnails/{document_id}.png" in response.headers["location"]


def test_thumbnail_generic_redirect(client, document_id):
    with patch("app.thumbnails.main.file_exists", return_value=False):
        response = client.get(
            f"/api/document/{document_id}/thumbnail",
            follow_redirects=False,
        )
        assert response.status_code == 307
        assert response.headers["location"] == "/home-megaphone.png"
