"""Settings + config-JSON/manifest helpers for the stress-test harness.

All settings come from env vars prefixed ``STRESS_`` (or a ``.env`` in the
working directory), e.g. ``STRESS_SCALE=0.01 STRESS_RUN_ID=smoke1``.
"""

import json
import os
from urllib.parse import urljoin
from urllib.request import urlopen

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CONFIG_URL = "https://tilesets1.cdn.districtr.org/stress-test/config.json"


class StressSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="STRESS_", env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    BASE_URL: str = "http://localhost:8000"
    RUN_ID: str = "dev"
    # Single scale factor applied to all population counts (1.0 = full test,
    # 0.01 = 1% smoke run).
    SCALE: float = 1.0
    WINDOW_SECONDS: int = 900
    # CDN config JSON listing seed plans (see STRESS_TEST_PLAN.md §8). May be
    # an http(s) URL or a local file path (used by the smoke fixture).
    CONFIG_URL: str = DEFAULT_CONFIG_URL
    # Seed manifest produced by the seed step (WS2 `stress-test-seed`, or
    # smoke_seed.py locally): {"documents": [{"document_id", "districtr_map_slug"}]}
    SEED_MANIFEST: str = ""
    # Manifest of documents created at runtime by editors; consumed by cleanup.
    RUNTIME_MANIFEST: str = ""
    RNG_SEED: int = 42
    # When true, locustfile asserts on quit that every request class succeeded
    # and editor saves round-tripped updated_at (exit code 1 otherwise).
    SMOKE_ASSERT: bool = False

    @property
    def user_agent(self) -> str:
        return f"districtr-stress-test/{self.RUN_ID}"

    @property
    def seed_manifest_path(self) -> str:
        return self.SEED_MANIFEST or f"stress_test_manifest_{self.RUN_ID}.json"

    @property
    def runtime_manifest_path(self) -> str:
        return (
            self.RUNTIME_MANIFEST or f"stress_test_runtime_manifest_{self.RUN_ID}.json"
        )


settings = StressSettings()


def _read_url_or_file(path_or_url: str) -> bytes:
    if path_or_url.startswith(("http://", "https://")):
        with urlopen(path_or_url) as resp:
            return resp.read()
    with open(path_or_url, "rb") as f:
        return f.read()


def load_config_rows(config_url: str | None = None) -> list[dict]:
    """Fetch the stress-test config JSON (CDN URL or local file)."""
    rows = json.loads(_read_url_or_file(config_url or settings.CONFIG_URL))
    assert isinstance(rows, list) and rows, "config JSON must be a non-empty list"
    return rows


def resolve_assignments_path(assignments_path: str, config_url: str) -> str:
    """assignments_path is relative to the CDN root (config lives under
    /stress-test/, data under /stress-data/); for a local config file it is
    relative to the config's directory."""
    if config_url.startswith(("http://", "https://")):
        return urljoin(config_url, "/" + assignments_path.lstrip("/"))
    return os.path.join(os.path.dirname(os.path.abspath(config_url)), assignments_path)


def load_seed_manifest(path: str) -> list[dict]:
    with open(path) as f:
        manifest = json.load(f)
    docs = manifest["documents"]
    assert docs, f"seed manifest {path} lists no documents"
    return docs
