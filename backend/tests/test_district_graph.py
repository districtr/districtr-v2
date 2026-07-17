"""Equivalence tests: DistrictGraph must behave like the networkx graph it replaces."""

import pickle
import random

import networkx as nx
import pytest

from app.evaluation.district_graph import DistrictGraph
from tests.constants import FIXTURES_PATH


# ks_ellis_county_block: plain block adjacency graph (no attrs, larger)
# simple_geos: dual-level graph with parent/children/weighted_edges/ncp
# grid_child: block graph annotated with parent ids that are NOT nodes
@pytest.fixture(
    scope="module", params=["ks_ellis_county_block", "simple_geos", "grid_child"]
)
def nx_graph(request) -> nx.Graph:
    with open(FIXTURES_PATH / "graph" / f"{request.param}.pkl", "rb") as f:
        return pickle.load(f)


@pytest.fixture(scope="module")
def dg(nx_graph) -> DistrictGraph:
    return DistrictGraph.from_networkx(nx_graph)


def test_membership_and_len(nx_graph, dg):
    assert len(dg) == nx_graph.number_of_nodes()
    for node in nx_graph.nodes():
        assert node in dg
        assert node in dg.nodes
    assert "not_a_node" not in dg
    assert dg.nodes.get("not_a_node") is None
    with pytest.raises(KeyError):
        dg.nodes["not_a_node"]
    # Longer than any stored id: must not false-positive via dtype truncation
    assert ("x" * 64) not in dg


def test_node_attrs_match(nx_graph, dg):
    for node, data in nx_graph.nodes(data=True):
        attrs = dg.nodes[node]
        assert attrs.get("parent") == data.get("parent")
        if "children" in data:
            assert attrs["children"] == frozenset(data["children"])
            assert isinstance(attrs["children"], frozenset)
        else:
            assert "children" not in attrs
        if "parent" in attrs:
            assert type(attrs["parent"]) is str


def test_graph_attrs_match(nx_graph, dg):
    assert set(dg.graph.keys()) == set(nx_graph.graph.keys())
    if "weighted_edges" in nx_graph.graph:
        assert dg.graph["weighted_edges"] == nx_graph.graph["weighted_edges"]
    if "non_contiguous_parents" in nx_graph.graph:
        assert dg.graph["non_contiguous_parents"] == set(
            nx_graph.graph["non_contiguous_parents"]
        )


def test_neighbors_match(nx_graph, dg):
    for node in nx_graph.nodes():
        assert set(dg.neighbors(node)) == set(nx_graph.neighbors(node))
    with pytest.raises(KeyError):
        dg.neighbors("not_a_node")


def test_connected_components_match(nx_graph, dg):
    rng = random.Random(42)
    all_nodes = list(nx_graph.nodes())
    sizes = {1, min(10, len(all_nodes)), max(1, len(all_nodes) // 3), len(all_nodes)}
    for size in sizes:
        subset = rng.sample(all_nodes, size)
        expected = {
            frozenset(c) for c in nx.connected_components(nx_graph.subgraph(subset))
        }
        got = {frozenset(c) for c in dg.connected_components(subset)}
        assert got == expected
        assert dg.number_connected_components(subset) == len(expected)
        assert dg.is_connected(subset) == (len(expected) == 1)


def test_unknown_ids_silently_dropped(nx_graph, dg):
    """nx G.subgraph(...) drops unknown ids; DistrictGraph must match."""
    subset = list(nx_graph.nodes())[:5] + ["missing_1", "missing_2"]
    expected = {
        frozenset(c) for c in nx.connected_components(nx_graph.subgraph(subset))
    }
    assert {frozenset(c) for c in dg.connected_components(subset)} == expected


def test_empty_subgraph_raises(dg):
    assert dg.connected_components([]) == []
    assert dg.number_connected_components(["missing"]) == 0
    with pytest.raises(ValueError):
        dg.is_connected([])


def test_component_ids_are_native_str(dg):
    subset = list(dg.nodes)[:20]
    for component in dg.connected_components(subset):
        for node in component:
            assert type(node) is str


def test_non_shatterable_graph():
    """Plain edge graphs (no parents / weighted_edges / ncp) keep nx semantics."""
    G = nx.Graph([("a", "b"), ("b", "c"), ("d", "e")])
    dg = DistrictGraph.from_networkx(G)
    assert dg.nodes["a"] == {}
    assert dg.nodes["a"].get("parent") is None
    assert "children" not in dg.nodes["a"]
    assert "weighted_edges" not in dg.graph
    assert dg.graph.get("non_contiguous_parents", set()) == set()
    assert dg.number_connected_components(["a", "b", "c", "d", "e"]) == 2
    assert dg.is_connected(["a", "b", "c"])
    assert not dg.is_connected(["a", "c"])


def test_single_node_no_edges():
    G = nx.Graph()
    G.add_node("only")
    dg = DistrictGraph.from_networkx(G)
    assert "only" in dg
    assert dg.neighbors("only") == []
    assert dg.is_connected(["only"])
