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
