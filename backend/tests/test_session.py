from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.db import get_session
from app.core.security import mint_session_token, require_session
from app.main import app


def _expired_token() -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"iat": now - timedelta(hours=5), "exp": now - timedelta(hours=1)},
        settings.SECRET_KEY,
        algorithm="HS256",
    )


def test_minted_token_accepted():
    token, expires_at = mint_session_token()
    assert require_session(token) is None
    assert expires_at > datetime.now(timezone.utc)


def test_missing_header_passes_when_not_enforced(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ENFORCE", False)
    require_session(None)  # should not raise


@pytest.mark.parametrize(
    "header", [None, "garbage", _expired_token()], ids=["missing", "garbage", "expired"]
)
def test_invalid_header_401_when_enforced(monkeypatch, header):
    monkeypatch.setattr(settings, "SESSION_ENFORCE", True)
    with pytest.raises(HTTPException) as exc:
        require_session(header)
    assert exc.value.status_code == 401
    assert exc.value.detail == "session_required"


def test_research_api_key_accepted(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ENFORCE", True)
    monkeypatch.setattr(settings, "RESEARCH_API_KEY", "research-key")
    require_session("research-key")  # should not raise


def test_post_session_mints_without_v3_key(monkeypatch):
    monkeypatch.setattr(settings, "RECAPTCHA_V3_SECRET_KEY", None)
    response = TestClient(app).post("/api/session", json={"recaptcha_token": ""})
    assert response.status_code == 200
    body = response.json()
    require_session(body["token"])  # minted token is valid
    datetime.fromisoformat(body["expires_at"])


def test_gated_endpoint_enforced(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_ENFORCE", True)
    app.dependency_overrides[get_session] = lambda: None
    try:
        client = TestClient(app, raise_server_exceptions=False)
        body = {"districtr_map_slug": "whatever"}

        response = client.post("/api/create_document", json=body)
        assert response.status_code == 401
        assert response.json()["detail"] == "session_required"

        token, _ = mint_session_token()
        response = client.post(
            "/api/create_document",
            json=body,
            headers={"X-Districtr-Session": token},
        )
        assert response.status_code != 401
    finally:
        app.dependency_overrides.clear()
