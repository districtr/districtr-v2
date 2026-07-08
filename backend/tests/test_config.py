"""Tests for app.core.config.Settings."""

from app.core.config import Settings, settings


def test_settings_validate_with_only_database_url(monkeypatch):
    """ECS provides DATABASE_URL but no POSTGRES_* parts."""
    for var in (
        "POSTGRES_SCHEME",
        "POSTGRES_SERVER",
        "POSTGRES_PORT",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_DB",
    ):
        monkeypatch.delenv(var, raising=False)

    url = "postgresql+psycopg://user:pass@host:5432/districtr"
    s = Settings(
        _env_file=None,
        DATABASE_URL=url,
        PROJECT_NAME="Districtr v2 backend",
        AUTH0_DOMAIN="my-tenant.us.auth0.com",
        AUTH0_API_AUDIENCE="http://localhost:8000/",
        AUTH0_ISSUER="https://my-tenant.us.auth0.com",
        AUTH0_ALGORITHMS="RS256",
    )

    assert str(s.SQLALCHEMY_DATABASE_URI) == url


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
