from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

import app.admin_ops.main as admin_ops
from app.core.security import auth
from app.main import app

IMPORT_URL = "/api/admin/gerrydb/import"
VALID_PAYLOAD = {"gpkg": "s3://test-bucket/co_blocks.gpkg", "layer": "co_blocks"}


def test_import_requires_auth():
    """Without the auth override, the real Security dependency must reject."""
    assert auth.verify not in app.dependency_overrides
    unauthenticated_client = TestClient(app)
    response = unauthenticated_client.post(IMPORT_URL, json=VALID_PAYLOAD)
    assert response.status_code in (401, 403)


def test_import_schedules_background_task(client):
    with patch("app.admin_ops.main.import_gerrydb_view") as mock_import:
        response = client.post(IMPORT_URL, json=VALID_PAYLOAD)

    assert response.status_code == 202
    assert response.json() == {"status": "scheduled", "layer": "co_blocks"}
    # TestClient runs background tasks before returning, so the (mocked)
    # import has already been called with the request's args.
    mock_import.assert_called_once()
    kwargs = mock_import.call_args.kwargs
    assert kwargs["layer"] == "co_blocks"
    assert kwargs["gpkg"] == "s3://test-bucket/co_blocks.gpkg"
    assert kwargs["table_name"] is None
    assert kwargs["rm"] is False


def test_import_passes_optional_fields(client):
    with patch("app.admin_ops.main.import_gerrydb_view") as mock_import:
        response = client.post(
            IMPORT_URL,
            json={**VALID_PAYLOAD, "table_name": "co_blocks_2020", "rm": True},
        )

    assert response.status_code == 202
    kwargs = mock_import.call_args.kwargs
    assert kwargs["table_name"] == "co_blocks_2020"
    assert kwargs["rm"] is True


@pytest.mark.parametrize(
    "bad_identifier",
    [
        "co-blocks",
        "co blocks",
        "co_blocks; DROP TABLE districtrmap",
        'co_blocks"--',
        "",
    ],
)
@pytest.mark.parametrize("field", ["layer", "table_name"])
def test_import_rejects_sql_unsafe_identifiers(client, field, bad_identifier):
    with patch("app.admin_ops.main.import_gerrydb_view") as mock_import:
        response = client.post(
            IMPORT_URL, json={**VALID_PAYLOAD, field: bad_identifier}
        )

    assert response.status_code == 422
    mock_import.assert_not_called()


@pytest.mark.parametrize(
    "bad_gpkg",
    ["s3://test-bucket/co_blocks.zip", "co_blocks", "https://example.com/co_blocks"],
)
def test_import_rejects_non_gpkg_paths(client, bad_gpkg):
    with patch("app.admin_ops.main.import_gerrydb_view") as mock_import:
        response = client.post(IMPORT_URL, json={**VALID_PAYLOAD, "gpkg": bad_gpkg})

    assert response.status_code == 422
    mock_import.assert_not_called()


def test_background_task_creates_own_session(client, session):
    """The task must not reuse the request-scoped session (closed at teardown)."""
    with patch("app.admin_ops.main.import_gerrydb_view") as mock_import:
        response = client.post(IMPORT_URL, json=VALID_PAYLOAD)

    assert response.status_code == 202
    task_session = mock_import.call_args.kwargs["session"]
    assert isinstance(task_session, Session)
    assert task_session is not session
    assert task_session.get_bind() is admin_ops.engine


def test_background_task_logs_failure(session, caplog):
    with patch(
        "app.admin_ops.main.import_gerrydb_view", side_effect=ValueError("boom")
    ):
        with pytest.raises(ValueError, match="boom"):
            admin_ops.run_gerrydb_import(
                layer="co_blocks",
                gpkg="s3://test-bucket/co_blocks.gpkg",
                session=session,
            )

    assert "Starting GerryDB import for layer co_blocks" in caplog.text
    assert "GerryDB import failed for layer co_blocks" in caplog.text


def test_background_task_logs_success(session, caplog):
    with patch("app.admin_ops.main.import_gerrydb_view"):
        admin_ops.run_gerrydb_import(
            layer="co_blocks",
            gpkg="s3://test-bucket/co_blocks.gpkg",
            session=session,
        )

    assert "GerryDB import succeeded for layer co_blocks" in caplog.text
