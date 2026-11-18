import pytest

import app.maintenance as maintenance


@pytest.fixture(autouse=True)
def maintenance_off(monkeypatch):
    # The PATCH flips a process-wide global; restore it so a failure here
    # can't 503 the rest of the suite.
    monkeypatch.setattr(maintenance, "enabled", False)


def test_get_site_settings_default(client):
    """Site settings default to not under construction, no banner"""
    response = client.get("/api/cms/site_settings")
    assert response.status_code == 200
    assert response.json() == {"under_construction": False, "banner_message": None}


def test_update_site_settings(client):
    """Toggling under_construction persists and is returned by GET"""
    response = client.patch("/api/cms/site_settings", json={"under_construction": True})
    assert response.status_code == 200
    expected = {"under_construction": True, "banner_message": None}
    assert response.json() == expected
    assert client.get("/api/cms/site_settings").json() == expected


def test_banner_message_round_trips_and_blank_clears(client):
    def save(message):
        return client.patch(
            "/api/cms/site_settings",
            json={"under_construction": False, "banner_message": message},
        )

    assert save("  Down Sat 9pm ET  ").json()["banner_message"] == "Down Sat 9pm ET"
    assert save("   ").json()["banner_message"] is None
    assert save("x" * 501).status_code == 422


def test_maintenance_mode_blocks_api_except_health_and_settings(client):
    client.patch("/api/cms/site_settings", json={"under_construction": True})
    blocked = client.get("/db_is_alive")
    assert blocked.status_code == 503
    assert blocked.headers["retry-after"] == "300"
    assert client.get("/").status_code == 200
    assert client.get("/api/cms/site_settings").status_code == 200

    client.patch("/api/cms/site_settings", json={"under_construction": False})
    assert client.get("/db_is_alive").status_code == 200
