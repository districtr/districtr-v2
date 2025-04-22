import boto3
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env", env_ignore_empty=True, extra="ignore"
    )

    # Volumes

    OUT_SCRATCH: Path = Path("/tmp")

    # R2

    S3_BUCKET: str | None = "districtr-v2-dev"
    ACCOUNT_ID: str | None = None
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


settings = Settings()
