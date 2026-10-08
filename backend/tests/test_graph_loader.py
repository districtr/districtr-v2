"""Tests for app.evaluation.graph_loader."""

from unittest.mock import MagicMock

from tests.constants import FIXTURES_PATH
import app.evaluation.graph_loader as graph_module
from app.evaluation.graph_loader import get_gerrydb_graph


def test_get_gerrydb_graph_streams_from_s3(monkeypatch):
    """S3 graphs are streamed into memory, never written to disk."""
    npz_bytes = (FIXTURES_PATH / "graph" / "simple_geos.npz").read_bytes()

    body = MagicMock()
    body.read.return_value = npz_bytes
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": body}
    stub_settings = MagicMock()
    stub_settings.get_s3_client.return_value = s3
    monkeypatch.setattr(graph_module, "settings", stub_settings)

    G = get_gerrydb_graph("s3://some-bucket/graphs/simple_geos.npz")

    s3.get_object.assert_called_once_with(
        Bucket="some-bucket", Key="graphs/simple_geos.npz"
    )
    s3.download_file.assert_not_called()
    assert G._weighted_edges


def test_get_gerrydb_graph():
    G = get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.npz"))

    block_nodes = {
        "000010000000001",
        "000010000000002",
        "000010000000003",
        "000010000000004",
        "000010000000005",
        "000010000000006",
    }
    vtd_nodes = {"vtd:000010000001", "vtd:000010000002", "vtd:000010000003"}
    assert set(G._node_ids.tolist()) == block_nodes | vtd_nodes
    assert G._weighted_edges
    assert isinstance(G._non_contiguous_parents, frozenset)


def test_get_gerrydb_graph_file_prefers_local_npz(tmp_path):
    """A local npz wins; a local pkl is ignored in favor of the S3 npz."""
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()
    (graphs_dir / "mymap.pkl").write_bytes(b"")
    assert graph_module.get_gerrydb_graph_file(
        "mymap", prefix=str(tmp_path)
    ).startswith("s3://")
    (graphs_dir / "mymap.npz").write_bytes(b"")
    assert graph_module.get_gerrydb_graph_file("mymap", prefix=str(tmp_path)) == str(
        graphs_dir / "mymap.npz"
    )


def test_load_graph_uses_shared_disk_cache(monkeypatch, tmp_path):
    """First load writes the mmap cache; later loads (any worker) mmap it."""
    import numpy as np

    monkeypatch.setattr(
        graph_module.settings, "GRAPH_CACHE_PATH", str(tmp_path), raising=False
    )
    monkeypatch.setattr(
        graph_module,
        "get_gerrydb_graph_file",
        lambda name: str(FIXTURES_PATH / "graph" / f"{name}.npz"),
    )

    G1 = graph_module._load_via_disk_cache("simple_geos")
    assert (tmp_path / "simple_geos" / "meta.json").exists()
    # Even the writing worker gets the mmap-backed copy
    assert isinstance(G1._node_ids, np.memmap)

    # A "second worker" (fresh call, no in-process LRU) loads from the cache
    G2 = graph_module._load_via_disk_cache("simple_geos")
    assert isinstance(G2._node_ids, np.memmap)
    assert G2._node_ids.tolist() == G1._node_ids.tolist()
    assert G2._weighted_edges == G1._weighted_edges


def test_load_graph_recovers_from_corrupt_disk_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(
        graph_module.settings, "GRAPH_CACHE_PATH", str(tmp_path), raising=False
    )
    monkeypatch.setattr(
        graph_module,
        "get_gerrydb_graph_file",
        lambda name: str(FIXTURES_PATH / "graph" / f"{name}.npz"),
    )
    cache_dir = tmp_path / "simple_geos"
    cache_dir.mkdir()
    (cache_dir / "meta.json").write_text("not json {")

    G = graph_module._load_via_disk_cache("simple_geos")
    assert G._weighted_edges
    # Cache was rebuilt cleanly
    assert (cache_dir / "meta.json").read_text().startswith("{")


def test_s3_npz_missing_raises(monkeypatch):
    """An S3 npz miss surfaces as ClientError — no retry against a pkl key."""
    import botocore.exceptions
    import pytest

    s3 = MagicMock()
    s3.get_object.side_effect = botocore.exceptions.ClientError(
        {"Error": {"Code": "NoSuchKey"}}, "GetObject"
    )
    stub_settings = MagicMock()
    stub_settings.get_s3_client.return_value = s3
    monkeypatch.setattr(graph_module, "settings", stub_settings)

    with pytest.raises(botocore.exceptions.ClientError):
        get_gerrydb_graph("s3://some-bucket/graphs/simple_geos.npz")
    s3.get_object.assert_called_once()
