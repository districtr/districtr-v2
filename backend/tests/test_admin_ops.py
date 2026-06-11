from contextlib import contextmanager
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session

import app.admin_ops.main as admin_ops
from app.core.security import auth
from app.main import app

IMPORT_URL = "/api/admin/gerrydb/import"
VALID_PAYLOAD = {"gpkg": "s3://test-bucket/co_blocks.gpkg", "layer": "co_blocks"}

COMPOSE_URL = "/api/admin/districtr-map/compose"
COMPOSE_PAYLOAD = {
    "name": "Compose demo map",
    "districtr_map_slug": "ks-demo-compose",
    "parent_layer": "compose_parent",
    "num_districts": 4,
}
COMPOSE_CHILD_PAYLOAD = {**COMPOSE_PAYLOAD, "child_layer": "compose_child"}


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


# ── POST /api/admin/districtr-map/compose ────────────────────────────────────

_UPSERT_GERRYDBTABLE = text("""
    INSERT INTO gerrydbtable (uuid, name, updated_at)
    VALUES (gen_random_uuid(), :name, now())
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
""")


@pytest.fixture(name="compose_layers")
def compose_layers_fixture(session: Session):
    """Register the parent/child layers in gerrydbtable (rows only, no geodata —
    the compose step functions are mocked in the tests that use this)."""
    for layer in ("compose_parent", "compose_child"):
        session.execute(_UPSERT_GERRYDBTABLE, {"name": layer})
    session.flush()


@pytest.fixture(name="compose_map_group")
def compose_map_group_fixture(session: Session):
    session.execute(
        text(
            "INSERT INTO map_group (name, slug) VALUES ('Compose group', 'compose-group') "
            "ON CONFLICT (slug) DO NOTHING"
        )
    )
    session.flush()


@pytest.fixture(name="compose_existing_districtr_map")
def compose_existing_districtr_map_fixture(session: Session, compose_layers):
    session.execute(
        text("""
            INSERT INTO districtrmap (uuid, name, districtr_map_slug, parent_layer, visible)
            VALUES (gen_random_uuid(), 'Existing compose map', :slug, 'compose_parent', false)
            ON CONFLICT (districtr_map_slug) DO NOTHING
        """),
        {"slug": COMPOSE_PAYLOAD["districtr_map_slug"]},
    )
    session.flush()


@contextmanager
def patch_compose_steps():
    """Patch the five compose step functions onto one Mock to record call order."""
    manager = Mock()
    manager.create_districtr_map.return_value = "districtr-map-uuid"
    with (
        patch(
            "app.admin_ops.main.create_shatterable_gerrydb_view",
            manager.create_shatterable_gerrydb_view,
        ),
        patch("app.admin_ops.main.create_districtr_map", manager.create_districtr_map),
        patch(
            "app.admin_ops.main.add_extent_to_districtrmap",
            manager.add_extent_to_districtrmap,
        ),
        patch(
            "app.admin_ops.main.create_parent_child_edges",
            manager.create_parent_child_edges,
        ),
        patch(
            "app.admin_ops.main.add_districtr_map_to_map_group",
            manager.add_districtr_map_to_map_group,
        ),
    ):
        yield manager


def test_compose_requires_auth():
    """Without the auth override, the real Security dependency must reject."""
    assert auth.verify not in app.dependency_overrides
    unauthenticated_client = TestClient(app)
    response = unauthenticated_client.post(COMPOSE_URL, json=COMPOSE_PAYLOAD)
    assert response.status_code in (401, 403)


@pytest.mark.parametrize(
    "bad_slug",
    [
        "Ks-Demo",
        "ks demo",
        "ks_demo",
        "ks-demo; DROP TABLE districtrmap",
        "",
    ],
)
def test_compose_rejects_bad_slug(client, bad_slug):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL, json={**COMPOSE_PAYLOAD, "districtr_map_slug": bad_slug}
        )

    assert response.status_code == 422
    assert manager.mock_calls == []


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
@pytest.mark.parametrize("field", ["parent_layer", "child_layer"])
def test_compose_rejects_sql_unsafe_layers(client, field, bad_identifier):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL, json={**COMPOSE_PAYLOAD, field: bad_identifier}
        )

    assert response.status_code == 422
    assert manager.mock_calls == []


@pytest.mark.parametrize("bad_num_districts", [0, 201])
def test_compose_rejects_out_of_range_num_districts(client, bad_num_districts):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL,
            json={**COMPOSE_PAYLOAD, "num_districts": bad_num_districts},
        )

    assert response.status_code == 422
    assert manager.mock_calls == []


def test_compose_404_unknown_parent_layer(client):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL, json={**COMPOSE_PAYLOAD, "parent_layer": "no_such_layer"}
        )

    assert response.status_code == 404
    assert "no_such_layer" in response.json()["detail"]
    assert manager.mock_calls == []


def test_compose_404_unknown_child_layer(client, compose_layers):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL, json={**COMPOSE_PAYLOAD, "child_layer": "no_such_child"}
        )

    assert response.status_code == 404
    assert "no_such_child" in response.json()["detail"]
    assert manager.mock_calls == []


def test_compose_409_duplicate_slug(client, compose_existing_districtr_map):
    with patch_compose_steps() as manager:
        response = client.post(COMPOSE_URL, json=COMPOSE_PAYLOAD)

    assert response.status_code == 409
    assert COMPOSE_PAYLOAD["districtr_map_slug"] in response.json()["detail"]
    assert manager.mock_calls == []


def test_compose_404_unknown_group(client, compose_layers):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL, json={**COMPOSE_PAYLOAD, "group_slug": "no-such-group"}
        )

    assert response.status_code == 404
    assert "no-such-group" in response.json()["detail"]
    assert manager.mock_calls == []


def test_compose_schedules_steps_with_child_layer(
    client, compose_layers, compose_map_group
):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL,
            json={**COMPOSE_CHILD_PAYLOAD, "group_slug": "compose-group"},
        )

    assert response.status_code == 202
    assert response.json() == {
        "status": "scheduled",
        "districtr_map_slug": "ks-demo-compose",
    }
    # TestClient runs background tasks before returning, so the (mocked) steps
    # have already been called, in CLI order.
    assert [call[0] for call in manager.mock_calls] == [
        "create_shatterable_gerrydb_view",
        "create_districtr_map",
        "add_extent_to_districtrmap",
        "create_parent_child_edges",
        "add_districtr_map_to_map_group",
    ]

    view_kwargs = manager.create_shatterable_gerrydb_view.call_args.kwargs
    assert view_kwargs["parent_layer"] == "compose_parent"
    assert view_kwargs["child_layer"] == "compose_child"
    assert view_kwargs["gerrydb_table_name"] == "ks_demo_compose_shatterable"

    map_kwargs = manager.create_districtr_map.call_args.kwargs
    assert map_kwargs["name"] == "Compose demo map"
    assert map_kwargs["districtr_map_slug"] == "ks-demo-compose"
    assert map_kwargs["parent_layer"] == "compose_parent"
    assert map_kwargs["child_layer"] == "compose_child"
    # Shatterable maps point at the combined materialized view.
    assert map_kwargs["gerrydb_table_name"] == "ks_demo_compose_shatterable"
    assert map_kwargs["num_districts"] == 4
    assert map_kwargs["tiles_s3_path"] is None
    assert map_kwargs["map_type"] == "default"
    assert map_kwargs["visibility"] is False

    extent_kwargs = manager.add_extent_to_districtrmap.call_args.kwargs
    assert extent_kwargs["districtr_map_uuid"] == "districtr-map-uuid"

    edges_kwargs = manager.create_parent_child_edges.call_args.kwargs
    assert edges_kwargs["districtr_map_uuid"] == "districtr-map-uuid"

    group_kwargs = manager.add_districtr_map_to_map_group.call_args.kwargs
    assert group_kwargs["districtr_map_slug"] == "ks-demo-compose"
    assert group_kwargs["group_slug"] == "compose-group"


def test_compose_schedules_steps_without_child_layer(client, compose_layers):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL,
            json={
                **COMPOSE_PAYLOAD,
                "tiles_s3_path": "tilesets/compose.pmtiles",
                "map_type": "local",
                "visible": True,
            },
        )

    assert response.status_code == 202
    assert [call[0] for call in manager.mock_calls] == [
        "create_districtr_map",
        "add_extent_to_districtrmap",
    ]
    manager.create_shatterable_gerrydb_view.assert_not_called()
    manager.create_parent_child_edges.assert_not_called()
    manager.add_districtr_map_to_map_group.assert_not_called()

    map_kwargs = manager.create_districtr_map.call_args.kwargs
    assert map_kwargs["child_layer"] is None
    # Unshatterable maps point straight at the parent layer.
    assert map_kwargs["gerrydb_table_name"] == "compose_parent"
    assert map_kwargs["tiles_s3_path"] == "tilesets/compose.pmtiles"
    assert map_kwargs["map_type"] == "local"
    assert map_kwargs["visibility"] is True


def test_compose_propagates_group_slug(client, compose_layers, compose_map_group):
    with patch_compose_steps() as manager:
        response = client.post(
            COMPOSE_URL, json={**COMPOSE_PAYLOAD, "group_slug": "compose-group"}
        )

    assert response.status_code == 202
    group_kwargs = manager.add_districtr_map_to_map_group.call_args.kwargs
    assert group_kwargs["districtr_map_slug"] == "ks-demo-compose"
    assert group_kwargs["group_slug"] == "compose-group"
    # The task commits once at the end; the step must not commit on its own.
    assert group_kwargs["autocommit"] is False


def test_compose_background_task_creates_own_session(client, session, compose_layers):
    """The task must not reuse the request-scoped session (closed at teardown)."""
    with patch_compose_steps() as manager:
        response = client.post(COMPOSE_URL, json=COMPOSE_PAYLOAD)

    assert response.status_code == 202
    task_session = manager.create_districtr_map.call_args.kwargs["session"]
    assert isinstance(task_session, Session)
    assert task_session is not session
    assert task_session.get_bind() is admin_ops.engine


def test_compose_background_task_logs_failure(session, caplog):
    with patch_compose_steps() as manager:
        manager.create_districtr_map.side_effect = ValueError("boom")
        with pytest.raises(ValueError, match="boom"):
            admin_ops.run_districtr_map_compose(
                name="Compose demo map",
                districtr_map_slug="ks-demo-compose",
                parent_layer="compose_parent",
                num_districts=4,
                session=session,
            )

    assert "Starting districtr map compose for ks-demo-compose" in caplog.text
    assert "Districtr map compose failed for ks-demo-compose" in caplog.text


def test_compose_background_task_logs_success(session, caplog):
    with patch_compose_steps():
        admin_ops.run_districtr_map_compose(
            name="Compose demo map",
            districtr_map_slug="ks-demo-compose",
            parent_layer="compose_parent",
            num_districts=4,
            session=session,
        )

    assert "Districtr map compose succeeded for ks-demo-compose" in caplog.text
