"""Tests for pipelines/transforms/graph.py.

Covers:
- graph_from_gpkg: edge loading from a GeoPackage SQLite table
- _annotate_graph_with_parents_from_gpkg: parent annotation via spatial join,
  including the nearest-parent fallback for geographical mismatch
- _build_combined_graph: dual-level graph structure and non-contiguous parent detection
- build_combined_graph_from_gpkg: end-to-end integration
- Orphaned nodes: graph edges referencing blocks with no corresponding geometry
"""

import sqlite3
from pathlib import Path

import pytest
from networkx import Graph

from transforms.graph import (
    _annotate_graph_with_parents_from_gpkg,
    _build_combined_graph,
    _gpkg_layer_name,
    build_combined_graph_from_gpkg,
    graph_from_gpkg,
)


# ---------------------------------------------------------------------------
# _gpkg_layer_name
# ---------------------------------------------------------------------------


def test_gpkg_layer_name_local_path():
    assert (
        _gpkg_layer_name(Path("/data/gerrydb/ak_block_view_v1.gpkg"))
        == "ak_block_view_v1"
    )


def test_gpkg_layer_name_s3_uri():
    assert (
        _gpkg_layer_name("s3://bucket/gerrydb/ak_block_view_v1.gpkg")
        == "ak_block_view_v1"
    )


# ---------------------------------------------------------------------------
# graph_from_gpkg
# ---------------------------------------------------------------------------


def test_graph_from_gpkg_loads_edges(normal_gpkgs):
    child_path, _ = normal_gpkgs
    G = graph_from_gpkg(child_path)

    assert G.number_of_nodes() == 6
    assert G.number_of_edges() == 7
    assert G.has_edge("block_00", "block_10")
    assert G.has_edge("block_01", "block_11")


def test_graph_from_gpkg_missing_table(no_edge_table_gpkg):
    with pytest.raises(sqlite3.OperationalError):
        graph_from_gpkg(no_edge_table_gpkg)


# ---------------------------------------------------------------------------
# _annotate_graph_with_parents_from_gpkg
# ---------------------------------------------------------------------------


def test_annotate_all_children_matched(normal_gpkgs):
    child_path, parent_path = normal_gpkgs
    G = graph_from_gpkg(child_path)
    _annotate_graph_with_parents_from_gpkg(
        G,
        child_path,
        parent_path,
        child_layer_name="simple_child",
        parent_layer_name="simple_parent",
    )

    assert all("parent" in G.nodes[n] for n in G.nodes)
    assert G.nodes["block_00"]["parent"] == "vtd_A"
    assert G.nodes["block_10"]["parent"] == "vtd_B"
    assert G.nodes["block_20"]["parent"] == "vtd_C"
    assert G.nodes["block_01"]["parent"] == "vtd_A"
    assert G.nodes["block_11"]["parent"] == "vtd_B"
    assert G.nodes["block_21"]["parent"] == "vtd_C"


def test_annotate_geographical_mismatch_leaves_block_without_parent(mismatch_gpkgs):
    """block_00's centroid falls outside the shrunk VTD_A polygon and has no
    fallback — annotation leaves block_00 without a parent. _build_combined_graph
    will subsequently raise ValueError to surface the data problem."""
    child_path, parent_path = mismatch_gpkgs
    G = graph_from_gpkg(child_path)
    _annotate_graph_with_parents_from_gpkg(
        G,
        child_path,
        parent_path,
        child_layer_name="mismatch_child",
        parent_layer_name="mismatch_parent",
    )

    assert (
        "parent" not in G.nodes["block_00"]
    ), "block_00 should be unmatched (mismatch)"
    # Other blocks are still matched normally
    assert G.nodes["block_10"]["parent"] == "vtd_B"
    assert G.nodes["block_20"]["parent"] == "vtd_C"


def test_annotate_geographical_mismatch_causes_build_failure(mismatch_gpkgs):
    """Unannotated blocks (from a mismatch) cause _build_combined_graph to raise ValueError."""
    child_path, parent_path = mismatch_gpkgs
    G = graph_from_gpkg(child_path)
    _annotate_graph_with_parents_from_gpkg(
        G,
        child_path,
        parent_path,
        child_layer_name="mismatch_child",
        parent_layer_name="mismatch_parent",
    )

    with pytest.raises(ValueError):
        _build_combined_graph(G)


def test_annotate_orphaned_node_has_no_parent(orphaned_node_gpkgs):
    """block_ghost appears in the edge list but has no geometry in the child layer.
    It cannot be annotated; every other node is annotated correctly."""
    child_path, parent_path = orphaned_node_gpkgs
    G = graph_from_gpkg(child_path)
    _annotate_graph_with_parents_from_gpkg(
        G,
        child_path,
        parent_path,
        child_layer_name="orphan_child",
        parent_layer_name="orphan_parent",
    )

    assert "parent" not in G.nodes["block_ghost"]
    # All real blocks are annotated
    for node in [
        "block_00",
        "block_10",
        "block_20",
        "block_01",
        "block_11",
        "block_21",
    ]:
        assert "parent" in G.nodes[node], f"{node} should have a parent"


def test_annotate_orphaned_node_causes_build_failure(orphaned_node_gpkgs):
    """_build_combined_graph raises ValueError when a node has no parent annotation,
    surfacing data problems explicitly."""
    child_path, parent_path = orphaned_node_gpkgs
    G = graph_from_gpkg(child_path)
    _annotate_graph_with_parents_from_gpkg(
        G,
        child_path,
        parent_path,
        child_layer_name="orphan_child",
        parent_layer_name="orphan_parent",
    )

    with pytest.raises(ValueError):
        _build_combined_graph(G)


# ---------------------------------------------------------------------------
# _build_combined_graph
# ---------------------------------------------------------------------------


def _make_annotated_graph():
    """Build a simple 6-node annotated graph matching the normal fixture topology."""
    edges = [
        ("block_00", "block_10"),
        ("block_10", "block_20"),
        ("block_00", "block_01"),
        ("block_10", "block_11"),
        ("block_20", "block_21"),
        ("block_01", "block_11"),
        ("block_11", "block_21"),
    ]
    G = Graph(edges)
    parents = {
        "block_00": "vtd_A",
        "block_01": "vtd_A",
        "block_10": "vtd_B",
        "block_11": "vtd_B",
        "block_20": "vtd_C",
        "block_21": "vtd_C",
    }
    for node, parent in parents.items():
        G.nodes[node]["parent"] = parent
    return G


def test_build_combined_graph_adds_parent_nodes():
    G = _make_annotated_graph()
    _build_combined_graph(G)

    assert "vtd_A" in G.nodes
    assert "vtd_B" in G.nodes
    assert "vtd_C" in G.nodes


def test_build_combined_graph_children_attribute():
    G = _make_annotated_graph()
    _build_combined_graph(G)

    assert G.nodes["vtd_A"]["children"] == {"block_00", "block_01"}
    assert G.nodes["vtd_B"]["children"] == {"block_10", "block_11"}
    assert G.nodes["vtd_C"]["children"] == {"block_20", "block_21"}


def test_build_combined_graph_weighted_edges():
    G = _make_annotated_graph()
    _build_combined_graph(G)

    we = G.graph["weighted_edges"]
    # vtd_A–vtd_B boundary: crossed by block_00–block_10 and block_01–block_11
    assert we.get(("vtd_A", "vtd_B"), we.get(("vtd_B", "vtd_A"))) == 2
    # vtd_B–vtd_C boundary: crossed by block_10–block_20 and block_11–block_21
    assert we.get(("vtd_B", "vtd_C"), we.get(("vtd_C", "vtd_B"))) == 2


def test_build_combined_graph_parent_adjacency_edges():
    G = _make_annotated_graph()
    _build_combined_graph(G)

    assert G.has_edge("vtd_A", "vtd_B")
    assert G.has_edge("vtd_B", "vtd_C")
    assert not G.has_edge("vtd_A", "vtd_C")


def test_build_combined_graph_no_non_contiguous_in_normal_case():
    G = _make_annotated_graph()
    _build_combined_graph(G)

    assert len(G.graph["non_contiguous_parents"]) == 0


def test_build_combined_graph_non_contiguous_parent_detected():
    """VTD_A is assigned block_00 and block_20 — separated by vtd_B, so non-contiguous.
    VTD_B owns only block_10 (single node, trivially contiguous).
    VTD_C owns block_01, block_11, block_21 — a connected chain via block_01–block_11
    and block_11–block_21 edges, so contiguous."""
    edges = [
        ("block_00", "block_10"),
        ("block_10", "block_20"),
        ("block_00", "block_01"),
        ("block_10", "block_11"),
        ("block_20", "block_21"),
        ("block_01", "block_11"),
        ("block_11", "block_21"),
    ]
    G = Graph(edges)
    parents = {
        "block_00": "vtd_A",
        "block_20": "vtd_A",  # non-contiguous: no path within vtd_A
        "block_10": "vtd_B",  # single node, trivially contiguous
        "block_01": "vtd_C",
        "block_11": "vtd_C",
        "block_21": "vtd_C",  # chain 01-11-21
    }
    for node, parent in parents.items():
        G.nodes[node]["parent"] = parent

    _build_combined_graph(G)

    assert "vtd_A" in G.graph["non_contiguous_parents"]
    assert "vtd_B" not in G.graph["non_contiguous_parents"]
    assert "vtd_C" not in G.graph["non_contiguous_parents"]


# ---------------------------------------------------------------------------
# build_combined_graph_from_gpkg (integration)
# ---------------------------------------------------------------------------


def test_build_combined_graph_from_gpkg_normal(normal_gpkgs):
    child_path, parent_path = normal_gpkgs
    G = build_combined_graph_from_gpkg(
        child_path,
        parent_path,
        child_layer_name="simple_child",
        parent_layer_name="simple_parent",
    )

    assert "weighted_edges" in G.graph
    assert "non_contiguous_parents" in G.graph
    assert "vtd_A" in G.nodes
    assert G.nodes["vtd_A"]["children"] == {"block_00", "block_01"}
    assert len(G.graph["non_contiguous_parents"]) == 0


def test_build_combined_graph_from_gpkg_non_contiguous(non_contiguous_gpkgs):
    child_path, parent_path = non_contiguous_gpkgs
    G = build_combined_graph_from_gpkg(
        child_path,
        parent_path,
        child_layer_name="nc_child",
        parent_layer_name="nc_parent",
    )

    assert "vtd_A" in G.graph["non_contiguous_parents"]
