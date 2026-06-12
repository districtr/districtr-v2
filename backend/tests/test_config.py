"""Tests for app.core.config.Settings."""

from app.core.config import settings


def test_get_s3_client_none_without_credentials(monkeypatch):
    """Local dev without keys keeps the 'S3 not configured' signal."""
    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", None)
    monkeypatch.setattr(settings, "AWS_SECRET_ACCESS_KEY", None)
    monkeypatch.setattr(settings, "AWS_USE_DEFAULT_CREDENTIALS", False)

    assert settings.get_s3_client() is None


def test_get_s3_client_default_chain(monkeypatch):
    """AWS deployments authenticate via the task role, not static keys."""
    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", None)
    monkeypatch.setattr(settings, "AWS_SECRET_ACCESS_KEY", None)
    monkeypatch.setattr(settings, "AWS_USE_DEFAULT_CREDENTIALS", True)

    client = settings.get_s3_client()

    assert client is not None
    assert client.meta.service_model.service_name == "s3"


def test_get_s3_client_static_keys_take_precedence(monkeypatch):
    monkeypatch.setattr(settings, "AWS_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(settings, "AWS_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr(settings, "AWS_USE_DEFAULT_CREDENTIALS", True)
    monkeypatch.setattr(settings, "ACCOUNT_ID", None)

    client = settings.get_s3_client()

    assert client is not None
    credentials = client._request_signer._credentials
    assert credentials.access_key == "test-key"
