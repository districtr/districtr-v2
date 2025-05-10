import os
from tests.constants import GERRY_DB_FIXTURE_NAME, USER_ID, FIXTURES_PATH
from unittest.mock import patch


def test_thumbnail_generator(client, document_id):
    with patch(
        "app.thumbnails.main.get_document_thumbnail_file_path"
    ) as mock_generate_thumbnail:
        response = client.post(
            "/api/create_document",
            json={
                "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
                "user_id": USER_ID,
            },
        )
        document_id = response.json().get("document_id")

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
