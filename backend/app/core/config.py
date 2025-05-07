import secrets
import warnings
import boto3
from functools import lru_cache
from typing import Annotated, Any

from pydantic import (
    AnyUrl,
    BeforeValidator,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self
from pathlib import Path
from enum import Enum


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list | str):
        return v
    raise ValueError(v)


class Environment(str, Enum):
    production = "production"
    qa = "qa"
    local = "local"
    test = "test"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    DOMAIN: str = "localhost"
    ENVIRONMENT: Environment = Environment.local

    @computed_field  # type: ignore[misc]
    @property
    def server_host(self) -> str:
        # Use HTTPS for anything other than local development
        if self.ENVIRONMENT == "local":
            return f"http://{self.DOMAIN}"
        return f"https://{self.DOMAIN}"

    BACKEND_CORS_ORIGINS: Annotated[
        list[AnyUrl] | str, BeforeValidator(parse_cors)
    ] = []

    PROJECT_NAME: str

    # Postgres

    POSTGRES_SCHEME: str
    POSTGRES_SERVER: str
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    DATABASE_URL: str

    @computed_field  # type: ignore[misc]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        if self.DATABASE_URL:
            return MultiHostUrl(self.DATABASE_URL)

        return MultiHostUrl.build(
            scheme=self.POSTGRES_SCHEME,
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    # Security

    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)

        return self

    # Volumes

    VOLUME_PATH: str = "/data"
    SQL_DIR: Path = Path(__file__).parent.parent / "sql"

    # R2

    R2_BUCKET_NAME: str | None = None
    ACCOUNT_ID: str | None = None
    AWS_S3_BUCKET: str | None = None
    AWS_S3_ENDPOINT: str | None = None
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None

    def get_s3_client(self):
        if not self.AWS_ACCESS_KEY_ID or not self.AWS_SECRET_ACCESS_KEY:
            return None

        kwargs = {}

        if self.ACCOUNT_ID:
            kwargs["endpoint_url"] = (
                f"https://{self.ACCOUNT_ID}.r2.cloudflarestorage.com"
            )
            kwargs["region_name"] = "auto"

        return boto3.client(
            service_name="s3",
            aws_access_key_id=self.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=self.AWS_SECRET_ACCESS_KEY,
            **kwargs,
        )

    # Auth0

    AUTH0_DOMAIN: str
    AUTH0_API_AUDIENCE: str
    AUTH0_ISSUER: str
    AUTH0_ALGORITHMS: str


@lru_cache()
def get_settings():
    return Settings()  # type: ignore


settings = get_settings()
