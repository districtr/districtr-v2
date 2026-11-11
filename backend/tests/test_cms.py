def test_get_site_settings_default(client):
    """Site settings default to not under construction"""
    response = client.get("/api/cms/site_settings")
    assert response.status_code == 200
    assert response.json() == {"under_construction": False}


def test_update_site_settings(client):
    """Toggling under_construction persists and is returned by GET"""
    response = client.patch("/api/cms/site_settings", json={"under_construction": True})
    assert response.status_code == 200
    assert response.json() == {"under_construction": True}
    assert client.get("/api/cms/site_settings").json() == {"under_construction": True}


def test_under_construction_rejects_writes(client, document_id):
    """While the flag is on, writes get a 503; reads and the toggle still work."""
    reset = f"/api/assignments/{document_id}/reset"
    try:
        client.patch("/api/cms/site_settings", json={"under_construction": True})
        response = client.patch(reset)
        assert response.status_code == 503
        assert "maintenance" in response.json()["detail"]
        assert client.get(f"/api/get_assignments/{document_id}").status_code == 200
    finally:
        # Also clears this process's cached flag for the tests that follow.
        client.patch("/api/cms/site_settings", json={"under_construction": False})
    assert client.patch(reset).status_code == 200
