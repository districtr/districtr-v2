import boto3
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"], env_ignore_empty=True, extra="ignore"
    )

    # Volumes

    OUT_SCRATCH: Path = Path("/tmp")

    # S3

    S3_BUCKET: str | None = "districtr-v2-dev"
    AWS_S3_ENDPOINT: str | None = None
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None

    def get_s3_client(self):
        if not self.AWS_ACCESS_KEY_ID or not self.AWS_SECRET_ACCESS_KEY:
            return None

        kwargs = {}
        if self.AWS_S3_ENDPOINT:
            kwargs["region_name"] = "auto"
            kwargs["endpoint_url"] = self.AWS_S3_ENDPOINT

        return boto3.client(
            service_name="s3",
            aws_access_key_id=self.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=self.AWS_SECRET_ACCESS_KEY,
            **kwargs,
        )

    # R2: tiles-worker/ serves district tilesets from here. Unset means S3 only.

    R2_BUCKET: str | None = None
    R2_ENDPOINT: str | None = None
    R2_ACCESS_KEY_ID: str | None = None
    R2_SECRET_ACCESS_KEY: str | None = None

    def get_r2_client(self):
        if not self.R2_BUCKET:
            return None
        # Fail loudly: a silently skipped copy would 404 the map once the Worker serves it.
        if not (
            self.R2_ENDPOINT and self.R2_ACCESS_KEY_ID and self.R2_SECRET_ACCESS_KEY
        ):
            raise ValueError(
                "R2_BUCKET is set, so R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be too"
            )
        return boto3.client(
            service_name="s3",
            endpoint_url=self.R2_ENDPOINT,
            region_name="auto",
            aws_access_key_id=self.R2_ACCESS_KEY_ID,
            aws_secret_access_key=self.R2_SECRET_ACCESS_KEY,
        )


settings = Settings()
