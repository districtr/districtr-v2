from unittest.mock import MagicMock

import pytest

from core.settings import Settings, settings
from tilesets.models import GerryDBTileset, TilesetBatch


def test_columns_survive_repeated_iteration():
    """Regression: with columns typed Iterable[str], pydantic v2 wrapped
    config-supplied values in a one-shot lazy iterable — generate_tiles drained
    it and generate_points silently saw no pop columns."""
    tileset = GerryDBTileset(
        gpkg="x.gpkg",
        layer_name="layer",
        new_layer_name=None,
        columns=iter(["path", "total_pop_20"]),
    )
    assert ",".join(tileset.columns) == "path,total_pop_20"
    # second pass — the one that used to come back empty
    assert [c for c in tileset.columns if "pop" in c.lower()] == ["total_pop_20"]


@pytest.mark.parametrize("r2_bucket", [None, "r2-bucket"])
def test_upload_results_copies_only_pmtiles_to_r2(monkeypatch, r2_bucket):
    """tiles-worker/ reads district tilesets from R2 under the S3 key; the
    points parquet stays S3-only, and with R2 unset nothing goes there."""
    s3, r2 = MagicMock(), MagicMock()
    monkeypatch.setattr(Settings, "get_s3_client", lambda self: s3)
    monkeypatch.setattr(
        Settings, "get_r2_client", lambda self: r2 if self.R2_BUCKET else None
    )
    monkeypatch.setattr(settings, "R2_BUCKET", r2_bucket)
    batch = TilesetBatch(name="test", tilesets={})
    batch.add_result("/tmp/wy.pmtiles", "tilesets/wy.pmtiles")
    batch.add_result("/tmp/wy_points.parquet", "tilesets/wy_points.parquet")

    batch.upload_results()

    assert s3.upload_file.call_count == 2
    if r2_bucket:
        r2.upload_file.assert_called_once_with(
            "/tmp/wy.pmtiles", "r2-bucket", "tilesets/wy.pmtiles"
        )
    else:
        r2.upload_file.assert_not_called()


def test_get_r2_client_refuses_partial_config():
    assert Settings(R2_BUCKET=None).get_r2_client() is None
    with pytest.raises(ValueError):
        Settings(
            R2_BUCKET="b",
            R2_ENDPOINT=None,
            R2_ACCESS_KEY_ID=None,
            R2_SECRET_ACCESS_KEY=None,
        ).get_r2_client()
    endpoint = "https://account.r2.cloudflarestorage.com"
    client = Settings(
        R2_BUCKET="b",
        R2_ENDPOINT=endpoint,
        R2_ACCESS_KEY_ID="k",
        R2_SECRET_ACCESS_KEY="s",
    ).get_r2_client()
    assert client.meta.endpoint_url == endpoint
