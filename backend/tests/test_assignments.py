import networkx as nx
import pytest

from app.assignments.assignments import _heal_with_graph


@pytest.fixture
def two_parent_graph():
    """Minimal dual-level graph: parent A (c1, c2), parent B (c3, c4, c5)."""
    G = nx.Graph()
    G.add_nodes_from(["c1", "c2", "c3", "c4", "c5"])
    G.nodes["c1"]["parent"] = "A"
    G.nodes["c2"]["parent"] = "A"
    G.nodes["c3"]["parent"] = "B"
    G.nodes["c4"]["parent"] = "B"
    G.nodes["c5"]["parent"] = "B"
    G.add_node("A", children={"c1", "c2"})
    G.add_node("B", children={"c3", "c4", "c5"})
    return G


def test_heal_empty_input(two_parent_graph):
    assert _heal_with_graph({}, two_parent_graph) == {}


def test_heal_full_coverage_uniform_zone(two_parent_graph):
    result = _heal_with_graph({"c1": 1, "c2": 1}, two_parent_graph)
    assert result == {"A": 1}


def test_heal_full_coverage_mixed_zones(two_parent_graph):
    result = _heal_with_graph({"c1": 1, "c2": 2}, two_parent_graph)
    assert result == {"c1": 1, "c2": 2}


def test_heal_partial_coverage(two_parent_graph):
    result = _heal_with_graph({"c1": 1}, two_parent_graph)
    assert result == {"c1": 1}


def test_heal_multiple_parents_one_healed(two_parent_graph):
    # A fully covered (healed), B partially covered (kept)
    result = _heal_with_graph({"c1": 1, "c2": 1, "c3": 2, "c4": 2}, two_parent_graph)
    assert result == {"A": 1, "c3": 2, "c4": 2}


def test_heal_multiple_parents_all_healed(two_parent_graph):
    result = _heal_with_graph(
        {"c1": 1, "c2": 1, "c3": 2, "c4": 2, "c5": 2}, two_parent_graph
    )
    assert result == {"A": 1, "B": 2}
