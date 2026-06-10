"""Tests for app.evaluation.graph."""

from tests.constants import FIXTURES_PATH
from app.evaluation.graph import get_gerrydb_graph


def test_get_gerrydb_graph():
    G = get_gerrydb_graph(str(FIXTURES_PATH / "graph" / "simple_geos.pkl"))

    block_nodes = {
        "000010000000001", "000010000000002", "000010000000003",
        "000010000000004", "000010000000005", "000010000000006",
    }
    vtd_nodes = {"vtd:000010000001", "vtd:000010000002", "vtd:000010000003"}
    assert set(G.nodes()) == block_nodes | vtd_nodes
    assert "weighted_edges" in G.graph
    assert "non_contiguous_parents" in G.graph
