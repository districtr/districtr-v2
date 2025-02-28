import boto3
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    # Volumes

    OUT_SCRATCH: Path = Path(__file__).parent / "scratch"

    # R2

    S3_BUCKET: str | None = "districtr-v2-dev"
    ACCOUNT_ID: str | None = None
    AWS_S3_ENDPOINT: str | None = None
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None

    def get_s3_client(self):
        if (
            not self.ACCOUNT_ID
            or not self.AWS_ACCESS_KEY_ID
            or not self.AWS_SECRET_ACCESS_KEY
        ):
            return None

        return boto3.client(
            service_name="s3",
            endpoint_url=f"https://{self.ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=self.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=self.AWS_SECRET_ACCESS_KEY,
            region_name="auto",
        )


settings = Settings()
