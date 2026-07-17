"""Tests for app.evaluation.graph."""

from unittest.mock import MagicMock

from tests.constants import FIXTURES_PATH
import app.evaluation.graph as graph_module
from app.evaluation.graph import get_gerrydb_graph


def test_get_gerrydb_graph_streams_from_s3(monkeypatch):
    """S3 graphs are streamed into memory, never written to disk."""
    pickled = (FIXTURES_PATH / "graph" / "simple_geos.pkl").read_bytes()

    body = MagicMock()
    body.read.return_value = pickled
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": body}
    stub_settings = MagicMock()
    stub_settings.get_s3_client.return_value = s3
    monkeypatch.setattr(graph_module, "settings", stub_settings)

    G = get_gerrydb_graph("s3://some-bucket/graphs/simple_geos.pkl")

    s3.get_object.assert_called_once_with(
        Bucket="some-bucket", Key="graphs/simple_geos.pkl"
    )
    s3.download_file.assert_not_called()
    assert "weighted_edges" in G.graph


def test_get_gerrydb_graph():
    G = get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.pkl"))

    block_nodes = {
        "000010000000001",
        "000010000000002",
        "000010000000003",
        "000010000000004",
        "000010000000005",
        "000010000000006",
    }
    vtd_nodes = {"vtd:000010000001", "vtd:000010000002", "vtd:000010000003"}
    assert set(G.nodes()) == block_nodes | vtd_nodes
    assert "weighted_edges" in G.graph
    assert "non_contiguous_parents" in G.graph


def test_get_gerrydb_graph_npz():
    """Loader dispatches on the .npz suffix."""
    G_npz = get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.npz"))
    G_pkl = get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.pkl"))
    assert list(G_npz.nodes) == list(G_pkl.nodes)
    assert G_npz.graph == G_pkl.graph


def test_get_gerrydb_graph_file_prefers_local_npz(tmp_path):
    graphs_dir = tmp_path / "graphs"
    graphs_dir.mkdir()
    (graphs_dir / "mymap.pkl").write_bytes(b"")
    assert graph_module.get_gerrydb_graph_file("mymap", prefix=str(tmp_path)).endswith(
        "mymap.pkl"
    )
    (graphs_dir / "mymap.npz").write_bytes(b"")
    assert graph_module.get_gerrydb_graph_file("mymap", prefix=str(tmp_path)).endswith(
        "mymap.npz"
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
        lambda name: str(FIXTURES_PATH / "graph" / f"{name}.pkl"),
    )

    G1 = graph_module._load_via_disk_cache("simple_geos")
    assert (tmp_path / "simple_geos" / "meta.json").exists()
    # Even the writing worker gets the mmap-backed copy
    assert isinstance(G1._node_ids, np.memmap)

    # A "second worker" (fresh call, no in-process LRU) loads from the cache
    G2 = graph_module._load_via_disk_cache("simple_geos")
    assert isinstance(G2._node_ids, np.memmap)
    assert list(G2.nodes) == list(G1.nodes)
    assert G2.graph == G1.graph


def test_load_graph_recovers_from_corrupt_disk_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(
        graph_module.settings, "GRAPH_CACHE_PATH", str(tmp_path), raising=False
    )
    monkeypatch.setattr(
        graph_module,
        "get_gerrydb_graph_file",
        lambda name: str(FIXTURES_PATH / "graph" / f"{name}.pkl"),
    )
    cache_dir = tmp_path / "simple_geos"
    cache_dir.mkdir()
    (cache_dir / "meta.json").write_text("not json {")

    G = graph_module._load_via_disk_cache("simple_geos")
    assert "weighted_edges" in G.graph
    # Cache was rebuilt cleanly
    assert (cache_dir / "meta.json").read_text().startswith("{")


def test_s3_npz_missing_falls_back_to_pkl(monkeypatch):
    """An S3 npz miss retries the legacy pkl key before giving up."""
    import botocore.exceptions

    pickled = (FIXTURES_PATH / "graph" / "simple_geos.pkl").read_bytes()

    def get_object(Bucket, Key):
        if Key.endswith(".npz"):
            raise botocore.exceptions.ClientError(
                {"Error": {"Code": "NoSuchKey"}}, "GetObject"
            )
        body = MagicMock()
        body.read.return_value = pickled
        return {"Body": body}

    s3 = MagicMock()
    s3.get_object.side_effect = get_object
    stub_settings = MagicMock()
    stub_settings.get_s3_client.return_value = s3
    monkeypatch.setattr(graph_module, "settings", stub_settings)

    G = get_gerrydb_graph("s3://some-bucket/graphs/simple_geos.npz")

    assert s3.get_object.call_count == 2
    assert "weighted_edges" in G.graph
