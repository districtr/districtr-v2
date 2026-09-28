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
