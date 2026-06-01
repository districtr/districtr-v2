import os
import pytest
from tests.constants import FIXTURES_PATH
from unittest.mock import patch
from datetime import datetime
from app.thumbnails.main import generate_thumbnail, generate_blank, THUMBNAIL_BUCKET


@pytest.fixture
def document_id_with_assignments(client, document_id):
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 1],
                ["202090443032011", 1],
                ["200979691001108", 2],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200

    return document_id


def test_thumbnail_generator(client, document_id_with_assignments, session):
    document_id = document_id_with_assignments
    out_path = f"{FIXTURES_PATH}/{document_id}.png"
    with patch(
        "app.thumbnails.main.get_document_thumbnail_file_path",
        return_value=out_path,
    ):
        # generate_thumbnail now owns its own session when run as a background task,
        # and that session can't see this test's uncommitted rows. Call it directly
        # with the shared test session to exercise generation in the test transaction.
        generate_thumbnail(
            document_id=document_id,
            out_directory=THUMBNAIL_BUCKET,
            session=session,
        )
        assert os.path.exists(out_path)
        assert os.stat(out_path).st_size > 0
        os.remove(out_path)


def test_make_thumbnail_endpoint_schedules_task(client, document_id):
    """The endpoint schedules generation WITHOUT handing it the request session."""
    with patch("app.thumbnails.main.generate_thumbnail") as mock_generate:
        response = client.post(f"/api/document/{document_id}/thumbnail")
        assert response.status_code == 200
        assert (
            response.json().get("message") == "Generating thumbnail in background task"
        )
        mock_generate.assert_called_once()
        assert "session" not in mock_generate.call_args.kwargs


def test_blank_thumbnail_generator(client, document_id, session):
    response = client.get(f"/api/document/{document_id}")
    districtrmap_slug = response.json().get("districtr_map_slug")
    out_path = f"{FIXTURES_PATH}/{districtrmap_slug}.png"
    with patch(
        "app.thumbnails.main.get_document_thumbnail_file_path",
        return_value=out_path,
    ):
        generate_blank(
            districtr_map_slug=districtrmap_slug,
            out_directory=THUMBNAIL_BUCKET,
            session=session,
        )
        assert os.path.exists(out_path)
        assert os.stat(out_path).st_size > 0
        os.remove(out_path)


def test_make_districtrmap_thumbnail_endpoint_schedules_task(client, document_id):
    """The endpoint schedules generation WITHOUT handing it the request session."""
    response = client.get(f"/api/document/{document_id}")
    districtrmap_slug = response.json().get("districtr_map_slug")
    with patch("app.thumbnails.main.generate_blank") as mock_generate:
        response = client.post(f"/api/gerrydb/{districtrmap_slug}/thumbnail")
        assert response.status_code == 200
        assert (
            response.json().get("message")
            == "Generating blank map thumbnail in background task"
        )
        mock_generate.assert_called_once()
        assert "session" not in mock_generate.call_args.kwargs


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
