from contextlib import nullcontext
from datetime import datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

import app.maintenance as maintenance

# conftest's autouse maintenance_isolated resets the process-wide flag and
# keeps the real poller off for every test.

SETTINGS = "/api/cms/site_settings"


def test_get_site_settings_default(client):
    """Site settings default to not under construction, no banner"""
    response = client.get(SETTINGS)
    assert response.status_code == 200
    assert response.json() == {
        "under_construction": False,
        "banner_message": None,
        "downtime_at": None,
    }


def test_update_site_settings(client):
    """Toggling under_construction persists and is returned by GET"""
    response = client.patch(SETTINGS, json={"under_construction": True})
    assert response.status_code == 200
    expected = {"under_construction": True, "banner_message": None, "downtime_at": None}
    assert response.json() == expected
    assert client.get(SETTINGS).json() == expected
    assert client.get(f"{SETTINGS}?fresh=true").json() == expected


def test_banner_message_normalizes_and_bounds(client):
    def save(message):
        return client.patch(SETTINGS, json={"banner_message": message})

    assert save("  Down Sat 9pm ET  ").json()["banner_message"] == "Down Sat 9pm ET"
    assert client.get(f"{SETTINGS}?fresh=true").json()["banner_message"] == (
        "Down Sat 9pm ET"
    )
    assert save("   ").json()["banner_message"] is None
    assert save("x" * 500).status_code == 200
    assert save("x" * 501).status_code == 422
    # The textarea submits CRLF; a line break counts once, as in maxlength.
    crlf = save("x" * 490 + "\r\n" * 10)
    assert crlf.status_code == 200
    assert crlf.json()["banner_message"] == "x" * 490


def test_patch_leaves_fields_it_does_not_send(client):
    client.patch(SETTINGS, json={"under_construction": True, "banner_message": "Hi"})
    assert client.patch(SETTINGS, json={"banner_message": "Bye"}).json() == {
        "under_construction": True,
        "banner_message": "Bye",
        "downtime_at": None,
    }
    assert client.patch(SETTINGS, json={"under_construction": False}).json() == {
        "under_construction": False,
        "banner_message": "Bye",
        "downtime_at": None,
    }


def test_get_serves_the_worker_snapshot_unless_fresh(client):
    maintenance.set_state(True, "from the poller", None)
    assert client.get(SETTINGS).json() == {
        "under_construction": True,
        "banner_message": "from the poller",
        "downtime_at": None,
    }
    assert client.get(f"{SETTINGS}?fresh=true").json() == {
        "under_construction": False,
        "banner_message": None,
        "downtime_at": None,
    }


def test_get_reads_the_row_until_this_worker_has_polled(client, session):
    # A worker that just started must not report the defaults (maintenance
    # off) while the row says otherwise.
    session.execute(
        text(
            "UPDATE cms.site_settings SET under_construction = true, "
            "banner_message = 'x' WHERE id = 1"
        )
    )
    assert maintenance.loaded is False
    body = client.get(SETTINGS).json()
    assert body["under_construction"] is True
    assert body["banner_message"] == "x"


def test_null_under_construction_leaves_it_alone(client):
    client.patch(SETTINGS, json={"under_construction": True})
    response = client.patch(
        SETTINGS, json={"under_construction": None, "banner_message": "Hi"}
    )
    assert response.status_code == 200
    assert response.json()["under_construction"] is True


def test_downtime_countdown_round_trips_and_ends_with_maintenance(client):
    at = "2026-11-18T21:10:00Z"
    saved = client.patch(SETTINGS, json={"downtime_at": at}).json()
    assert datetime.fromisoformat(saved["downtime_at"]) == datetime.fromisoformat(at)
    fresh = client.get(f"{SETTINGS}?fresh=true").json()
    assert datetime.fromisoformat(fresh["downtime_at"]) == datetime.fromisoformat(at)
    # A naive time would be read in the server's zone; refuse it.
    assert (
        client.patch(SETTINGS, json={"downtime_at": "2026-11-18T21:10:00"}).status_code
        == 422
    )
    # Clearing it explicitly, then: turning maintenance on clears it too.
    assert (
        client.patch(SETTINGS, json={"downtime_at": None}).json()["downtime_at"] is None
    )
    client.patch(SETTINGS, json={"downtime_at": at})
    on = client.patch(SETTINGS, json={"under_construction": True}).json()
    assert on["downtime_at"] is None
    assert client.get(SETTINGS).json()["downtime_at"] is None


def test_maintenance_mode_blocks_api_except_health_and_settings(client):
    client.patch(SETTINGS, json={"under_construction": True})
    blocked = client.get("/db_is_alive")
    assert blocked.status_code == 503
    assert blocked.headers["retry-after"] == "300"
    # Inside CORS, so browsers can read it.
    assert blocked.headers["access-control-allow-origin"] == "http://localhost:5173"
    # Exact paths, not the /api/cms/ prefix.
    assert client.get("/api/cms/anything-else").status_code == 503
    assert client.get("/").status_code == 200
    assert client.get(SETTINGS).status_code == 200

    client.patch(SETTINGS, json={"under_construction": False})
    assert client.get("/db_is_alive").status_code == 200


@pytest.fixture
def poll_engine(session, monkeypatch):
    """Point the poller at the test session's connection."""
    monkeypatch.setattr(
        maintenance,
        "engine",
        SimpleNamespace(connect=lambda: nullcontext(session.connection())),
    )


def test_poll_once_reads_the_row(session, poll_engine):
    session.execute(
        text(
            "UPDATE cms.site_settings SET under_construction = true, "
            "banner_message = 'Back at 10', "
            "downtime_at = '2026-11-18T21:10:00Z' WHERE id = 1"
        )
    )
    maintenance.poll_once()
    assert maintenance.enabled is True
    assert maintenance.banner_message == "Back at 10"
    assert maintenance.downtime_at == datetime.fromisoformat("2026-11-18T21:10:00Z")
    assert maintenance.loaded is True


def test_poll_once_keeps_the_last_value_when_the_db_is_down(monkeypatch):
    maintenance.set_state(True, "Down", None)

    def unreachable():
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(maintenance, "engine", SimpleNamespace(connect=unreachable))
    maintenance.poll_once()
    assert maintenance.enabled is True
    assert maintenance.banner_message == "Down"


def test_poll_once_does_not_undo_a_patch_that_landed_mid_poll(monkeypatch):
    stale_row = SimpleNamespace(
        under_construction=True, banner_message="old", downtime_at=None
    )

    class Conn:
        def execute(self, _query):
            # A PATCH in this worker commits while the poll's read is in flight.
            maintenance.set_state(False, "patched", None)
            return SimpleNamespace(one_or_none=lambda: stale_row)

    monkeypatch.setattr(
        maintenance, "engine", SimpleNamespace(connect=lambda: nullcontext(Conn()))
    )
    maintenance.poll_once()
    assert maintenance.enabled is False
    assert maintenance.banner_message == "patched"
