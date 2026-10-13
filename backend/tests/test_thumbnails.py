import os
import pytest
from tests.constants import FIXTURES_PATH
from unittest.mock import patch, MagicMock
from datetime import datetime
from botocore.exceptions import ClientError
from app.core.config import settings
from app.core.io import file_exists
from app.thumbnails.main import (
    generate_thumbnail,
    generate_blank,
    get_thumbnail_file_path,
    get_thumbnail_environment_folder,
    THUMBNAIL_BUCKET,
)


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
        "app.thumbnails.main.get_thumbnail_file_path",
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
        "app.thumbnails.main.get_blank_thumbnail_file_path",
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
    public_id = client.get(f"/api/document/{document_id}").json()["public_id"]
    with patch("app.thumbnails.main.file_exists", return_value=True):
        response = client.get(
            f"/api/document/{public_id}/thumbnail",
            follow_redirects=False,
        )
        assert response.status_code == 307
        assert (
            f"/thumbnails/{get_thumbnail_environment_folder()}/{public_id}.png"
            in response.headers["location"]
        )


def test_thumbnail_cdn_redirect_resolves_raw_document_id(client, document_id):
    """Edit/password links carry the raw document UUID (not public_id) in
    their OG image URL — the endpoint must resolve it to the same thumbnail
    a public_id lookup would find, not miss because of a mismatched key."""
    public_id = client.get(f"/api/document/{document_id}").json()["public_id"]
    with patch("app.thumbnails.main.file_exists", return_value=True):
        response = client.get(
            f"/api/document/{document_id}/thumbnail",
            follow_redirects=False,
        )
        assert response.status_code == 307
        assert (
            f"/thumbnails/{get_thumbnail_environment_folder()}/{public_id}.png"
            in response.headers["location"]
        )


def test_thumbnail_unresolvable_id_falls_back_to_placeholder(client):
    response = client.get(
        "/api/document/not-a-real-id/thumbnail",
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert response.headers["location"] == "/home-megaphone.png"


def test_thumbnail_file_path_is_environment_scoped(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    dev_path = get_thumbnail_file_path("123")

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    prod_path = get_thumbnail_file_path("123")

    assert dev_path != prod_path
    assert "/development/" in dev_path
    assert "/production/" in prod_path


@pytest.mark.parametrize("environment", ["local", "development", "qa", "test"])
def test_non_production_environments_share_one_thumbnail_folder(
    monkeypatch, environment
):
    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    assert get_thumbnail_environment_folder() == "development"


def test_thumbnail_generic_redirect(client, document_id):
    with patch("app.thumbnails.main.file_exists", return_value=False):
        response = client.get(
            f"/api/document/{document_id}/thumbnail",
            follow_redirects=False,
        )
        assert response.status_code == 307
        assert response.headers["location"] == "/home-megaphone.png"


def test_file_exists_returns_false_on_s3_404_instead_of_raising():
    """A HeadObject 404 (object genuinely doesn't exist) must fall back to
    the placeholder image, not surface as an unhandled ClientError/500."""
    mock_s3 = MagicMock()
    mock_s3.head_object.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject"
    )
    with patch.object(type(settings), "get_s3_client", return_value=mock_s3):
        assert file_exists("s3://some-bucket/thumbnails/production/999999.png") is False


def test_file_exists_reraises_non_404_s3_errors():
    mock_s3 = MagicMock()
    mock_s3.head_object.side_effect = ClientError(
        {"Error": {"Code": "403", "Message": "Forbidden"}}, "HeadObject"
    )
    with patch.object(type(settings), "get_s3_client", return_value=mock_s3):
        with pytest.raises(ClientError):
            file_exists("s3://some-bucket/thumbnails/production/999999.png")
