import networkx as nx
import pytest

from app.assignments.assignments import _detect_outlier_labels, _heal_or_fill


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


# --- heal behaviour ---


def test_empty_input(two_parent_graph):
    assert _heal_or_fill({}, two_parent_graph) == {}


def test_heal_full_coverage_uniform_zone(two_parent_graph):
    result = _heal_or_fill({"c1": 1, "c2": 1}, two_parent_graph)
    assert result == {"A": 1}


def test_heal_full_coverage_mixed_zones(two_parent_graph):
    # Mixed zones: cannot heal, children kept as-is (all present so no fill either)
    result = _heal_or_fill({"c1": 1, "c2": 2}, two_parent_graph)
    assert result == {"c1": 1, "c2": 2}


def test_heal_multiple_parents_all_healed(two_parent_graph):
    result = _heal_or_fill(
        {"c1": 1, "c2": 1, "c3": 2, "c4": 2, "c5": 2}, two_parent_graph
    )
    assert result == {"A": 1, "B": 2}


# --- fill behaviour ---


def test_fill_partial_coverage_single_parent(two_parent_graph):
    # c1 assigned; c2 is the missing sibling and must be filled with None
    result = _heal_or_fill({"c1": 1}, two_parent_graph)
    assert result == {"c1": 1, "c2": None}


def test_fill_partial_coverage_multiple_missing(two_parent_graph):
    # Only c3 assigned; c4 and c5 must be filled
    result = _heal_or_fill({"c3": 2}, two_parent_graph)
    assert result == {"c3": 2, "c4": None, "c5": None}


def test_heal_one_parent_fill_other(two_parent_graph):
    # A fully covered (healed), B partially covered (c3 assigned, c4/c5 filled)
    result = _heal_or_fill({"c1": 1, "c2": 1, "c3": 2}, two_parent_graph)
    assert result == {"A": 1, "c3": 2, "c4": None, "c5": None}


def test_fill_does_not_overwrite_assigned(two_parent_graph):
    # B's children have mixed zones (no heal); A partially assigned (c2 filled)
    result = _heal_or_fill({"c1": 1, "c3": 1, "c4": 2, "c5": 2}, two_parent_graph)
    assert result == {"c1": 1, "c2": None, "c3": 1, "c4": 2, "c5": 2}


def test_no_child_nodes_unaffected(two_parent_graph):
    # Nodes without a "parent" key pass through unchanged
    two_parent_graph.add_node("standalone")
    result = _heal_or_fill({"standalone": 3}, two_parent_graph)
    assert result == {"standalone": 3}


# --- outlier label detection ---


def test_outlier_single_huge_label_flagged():
    # A lone zone labeled '196' on a map defaulting to 8 districts is accidental.
    assert _detect_outlier_labels({"196"}, 8) == {"196"}


def test_outlier_partial_plan_label_trusted():
    # 'district 5 of 8' style partial plans are within the reference — trusted.
    assert _detect_outlier_labels({"5"}, 8) == set()


def test_outlier_among_dense_labels_flagged():
    labels = {str(i) for i in range(1, 11)} | {"196"}
    assert _detect_outlier_labels(labels, 8) == {"196"}


def test_two_outliers_flagged():
    labels = {str(i) for i in range(1, 11)} | {"150", "196"}
    assert _detect_outlier_labels(labels, 8) == {"150", "196"}


def test_spread_out_labels_trusted():
    # Three similarly large labels anchor the reference — genuinely spread out.
    assert _detect_outlier_labels({"100", "200", "300"}, 8) == set()


def test_dense_plan_untouched():
    labels = {str(i) for i in range(1, 18)}
    assert _detect_outlier_labels(labels, 8) == set()


def test_non_numeric_labels_ignored_by_detection():
    assert _detect_outlier_labels({"District A", "District B"}, 8) == set()
