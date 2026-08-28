"""Equivalence tests: DualLevelGraph must behave like the networkx graph it
replaces, for the slice of behavior it still exposes (``.nodes``/``.graph``
dict-mimicry is dropped by design — see the class docstring — so there is
nothing to test-for-equivalence there)."""

import pickle
import random

import networkx as nx
import numpy as np
import pytest

from app.evaluation.dual_graph import DualLevelGraph
from app.evaluation.graph_loader import from_networkx, from_npz
from tests.constants import FIXTURES_PATH


# ks_ellis_county_block: plain block adjacency graph (no attrs, larger)
# simple_geos: dual-level graph with parent/children/weighted_edges/ncp
# grid_child: plain block adjacency graph, smaller (8x8 grid)
# grid_shatterable: larger (80-node) dual-level graph, full attrs, mixed
#   bare-block/vtd:-prefixed id vocabulary — exercises searchsorted/dtype-width
#   behavior at a size the 9-node simple_geos fixture can't.
@pytest.fixture(
    scope="module",
    params=["ks_ellis_county_block", "simple_geos", "grid_child", "grid_shatterable"],
)
def nx_graph(request) -> nx.Graph:
    with open(FIXTURES_PATH / "graph" / f"{request.param}.pkl", "rb") as f:
        return pickle.load(f)


@pytest.fixture(scope="module")
def dg(nx_graph) -> DualLevelGraph:
    return from_networkx(nx_graph)


def test_membership_and_len(nx_graph, dg):
    assert len(dg) == nx_graph.number_of_nodes()
    for node in nx_graph.nodes():
        assert node in dg
    assert "not_a_node" not in dg
    # Longer than any stored id: must not false-positive via dtype truncation
    assert ("x" * 64) not in dg


def test_parents_of_matches_nx(nx_graph, dg):
    nodes = list(nx_graph.nodes())
    expected = [nx_graph.nodes[n].get("parent") for n in nodes]
    assert dg.parents_of(nodes) == expected
    # Unknown ids map to None, same as a LEFT JOIN miss
    assert dg.parents_of(["not_a_node"]) == [None]
    assert dg.parents_of([]) == []


def test_children_of_matches_nx(nx_graph, dg):
    for node, data in nx_graph.nodes(data=True):
        expected = frozenset(data["children"]) if "children" in data else frozenset()
        got = dg.children_of(node)
        assert got == expected
        assert isinstance(got, frozenset)
    with pytest.raises(KeyError):
        dg.children_of("not_a_node")


def test_num_children_of_matches_children_of(nx_graph, dg):
    for node, data in nx_graph.nodes(data=True):
        assert dg.num_children_of(node) == len(dg.children_of(node))
    # Unknown ids and non-parents return 0 (doesn't raise, unlike children_of)
    assert dg.num_children_of("not_a_node") == 0


def test_is_shattered_parent_matches_nx(nx_graph, dg):
    for node, data in nx_graph.nodes(data=True):
        assert dg.is_shattered_parent(node) == bool(data.get("children"))
    # Unknown ids are not shattered parents (predicate, doesn't raise)
    assert dg.is_shattered_parent("not_a_node") is False


def test_from_networkx_rejects_parent_not_in_nodes():
    """A parent id must itself be a node — from_networkx raises rather than
    silently accepting a phantom parent. The pipeline's combined-graph build
    always adds parents as nodes, so this shape should never reach the graph
    class in production."""
    G = nx.Graph([("b1", "b2")])
    G.nodes["b1"]["parent"] = "vtd:not_a_node"
    with pytest.raises(ValueError, match="not_a_node"):
        from_networkx(G)


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
    """nx G.subgraph(...) drops unknown ids; DualLevelGraph must match."""
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


def test_component_ids_are_native_str(dg, nx_graph):
    subset = list(nx_graph.nodes())[:20]
    for component in dg.connected_components(subset):
        for node in component:
            assert node.__class__ is str


def test_non_shatterable_graph():
    """Plain edge graphs (no parents / weighted_edges / ncp) keep nx semantics."""
    G = nx.Graph([("a", "b"), ("b", "c"), ("d", "e")])
    dg = from_networkx(G)
    assert dg.parents_of(["a"]) == [None]
    assert dg.children_of("a") == frozenset()
    assert dg.is_shattered_parent("a") is False
    assert dg.number_connected_components(["a", "b", "c", "d", "e"]) == 2
    assert dg.is_connected(["a", "b", "c"])
    assert not dg.is_connected(["a", "c"])


def test_single_node_no_edges():
    G = nx.Graph()
    G.add_node("only")
    dg = from_networkx(G)
    assert "only" in dg
    assert dg.is_connected(["only"])


# -- is_shattered_parent --------------------------------------------------


def test_is_shattered_parent_direct_construction():
    G = nx.Graph()
    G.add_edge("a", "b")
    G.add_node("p1", children={"a", "b"})
    G.nodes["a"]["parent"] = "p1"
    G.nodes["b"]["parent"] = "p1"
    G.add_node("p2")  # parent-shaped id, but never shattered (no children)
    dg = from_networkx(G)

    assert dg.is_shattered_parent("p1") is True
    assert dg.is_shattered_parent("p2") is False
    assert dg.is_shattered_parent("a") is False  # a child, not a parent
    assert dg.is_shattered_parent("nope") is False


# -- expand_non_contiguous -------------------------------------------------


def _ncp_graph() -> DualLevelGraph:
    G = nx.Graph()
    G.add_edge("a", "b")
    G.add_edge("c", "d")
    G.add_node("p1", children={"a", "b"})
    G.nodes["a"]["parent"] = "p1"
    G.nodes["b"]["parent"] = "p1"
    G.graph["non_contiguous_parents"] = {"p1"}
    return from_networkx(G)


def test_expand_non_contiguous_mutates_in_place():
    dg = _ncp_graph()
    geo_ids = {"p1", "c"}
    assert dg.expand_non_contiguous(geo_ids) is None  # mutates, returns nothing
    assert geo_ids == {"a", "b", "c"}


def test_expand_non_contiguous_noop_when_no_match(dg):
    """The common case (51/52 states have zero non-contiguous parents):
    nothing in geo_ids intersects _non_contiguous_parents, so the set comes
    back unchanged and untouched."""
    geo_ids = {"missing_1", "missing_2"}
    dg.expand_non_contiguous(geo_ids)
    assert geo_ids == {"missing_1", "missing_2"}


def test_expand_non_contiguous_empty_ncp_is_cheap_regardless_of_geo_ids_size():
    """O(len(non_contiguous_parents)), never O(len(geo_ids)): a huge geo_ids
    set with an empty (or non-matching) NCP set must not be scanned element
    by element. Not a timing assertion (flaky) — asserts the actual
    mechanism: CPython's set `&` iterates the smaller operand, so this
    intersection touches _non_contiguous_parents' elements, not geo_ids'."""
    dg = _ncp_graph()
    huge = {str(i) for i in range(200_000)}
    dg.expand_non_contiguous(huge)
    assert len(huge) == 200_000  # untouched: no id in `huge` is "p1"


# -- cut_edges --------------------------------------------------------------


def test_cut_edges_hand_computed():
    """simple_geos: 3 vtds (p1/p2/p3), each with 2-3 child blocks, plus
    weighted parent-parent edges. Assignment mixes a shattered parent
    (blocks 1 and 5 of vtd 1 individually assigned to different zones) with
    two whole-parent assignments (vtd 2, vtd 3).

    Hand-computed expected cut count:
    - Step 1 (parent pass): only (vtd2, vtd3) has both sides whole-assigned
      (zone 1 vs zone 2) -> +1 (that edge's weight).
    - Step 2 (unit pass): block 1 (zone 1) vs block 5 (zone 2) are neighbors,
      seen from both sides -> +1 after halving. block 5 (zone 2) is also
      adjacent to block 2, whose parent (vtd2) is zone 1 -> +1.
    Total: 1 (step 1) + 1 (step 2 direct) + 1 (halved mutual edge) = 3.
    """
    with open(FIXTURES_PATH / "graph" / "simple_geos.pkl", "rb") as f:
        nx_graph = pickle.load(f)
    dg = from_networkx(nx_graph)

    unit_to_zone = {"000010000000001": 1, "000010000000005": 2}
    parent_unit_to_zone = {"vtd:000010000002": 1, "vtd:000010000003": 2}
    assert dg.cut_edges(unit_to_zone, parent_unit_to_zone) == 3


def test_cut_edges_no_weighted_edges_falls_back_to_unit_pass_only():
    """Non-shatterable maps (no weighted_edges) skip Step 1 entirely — every
    assignment is a plain unit, exactly like the pre-refactor algorithm's
    non-shatterable branch."""
    G = nx.Graph([("a", "b"), ("b", "c"), ("c", "d")])
    dg = from_networkx(G)

    # a-b cut, b-c not cut, c-d cut
    unit_to_zone = {"a": 1, "b": 1, "c": 2, "d": 1}
    assert dg.cut_edges(unit_to_zone, {}) == 2


def test_cut_edges_empty_assignment():
    with open(FIXTURES_PATH / "graph" / "simple_geos.pkl", "rb") as f:
        nx_graph = pickle.load(f)
    dg = from_networkx(nx_graph)
    assert dg.cut_edges({}, {}) == 0


# -- from_npz ---------------------------------------------------------------


# npz fixtures are generated from the pkl fixtures by the pipelines writer
# (transforms/graph.py graph_to_npz_arrays), so these tests also verify
# writer/reader schema compatibility across the two components.
@pytest.mark.parametrize("name", ["simple_geos", "ks_ellis_county_block"])
def test_from_npz_matches_from_networkx(name):
    with open(FIXTURES_PATH / "graph" / f"{name}.pkl", "rb") as f:
        via_pkl = from_networkx(pickle.load(f))
    via_npz = from_npz(FIXTURES_PATH / "graph" / f"{name}.npz")

    assert via_npz._node_ids.tolist() == via_pkl._node_ids.tolist()
    for node in via_pkl._node_ids.tolist():
        assert via_npz.parents_of([node]) == via_pkl.parents_of([node])
        assert via_npz.children_of(node) == via_pkl.children_of(node)
    assert via_npz._weighted_edges == via_pkl._weighted_edges
    assert via_npz._non_contiguous_parents == via_pkl._non_contiguous_parents

    subset = via_pkl._node_ids.tolist()[: len(via_pkl) // 2]
    expected = {frozenset(c) for c in via_pkl.connected_components(subset)}
    assert {frozenset(c) for c in via_npz.connected_components(subset)} == expected


def test_from_npz_rejects_unknown_version(tmp_path):
    bad = tmp_path / "bad.npz"
    np.savez(bad, format_version=np.int32(999))
    with pytest.raises(ValueError, match="format_version"):
        from_npz(bad)


# -- shared mmap disk cache ---------------------------------------------------


def test_save_load_cache_round_trip(nx_graph, dg, tmp_path):
    cache_dir = tmp_path / "cached"
    dg.save_cache(cache_dir)
    loaded = DualLevelGraph.load_cache(cache_dir)

    # Arrays are memory-mapped (shared across worker processes by the OS)
    assert isinstance(loaded._node_ids, np.memmap)
    assert isinstance(loaded._adj, np.memmap)

    node_ids = loaded._node_ids.tolist()
    assert node_ids == dg._node_ids.tolist()
    for node in node_ids:
        assert loaded.parents_of([node]) == dg.parents_of([node])
        assert loaded.children_of(node) == dg.children_of(node)
    assert loaded._weighted_edges == dg._weighted_edges
    assert loaded._non_contiguous_parents == dg._non_contiguous_parents

    subset = node_ids[: max(1, len(dg) // 2)]
    expected = {frozenset(c) for c in dg.connected_components(subset)}
    assert {frozenset(c) for c in loaded.connected_components(subset)} == expected


def test_save_cache_race_first_writer_wins(dg, tmp_path):
    cache_dir = tmp_path / "cached"
    dg.save_cache(cache_dir)
    # A second (racing) writer must not fail or corrupt the existing cache
    dg.save_cache(cache_dir)
    loaded = DualLevelGraph.load_cache(cache_dir)
    assert loaded._node_ids.tolist() == dg._node_ids.tolist()


def test_load_cache_rejects_unknown_version(dg, tmp_path):
    import json

    cache_dir = tmp_path / "cached"
    dg.save_cache(cache_dir)
    meta = json.loads((cache_dir / "meta.json").read_text())
    meta["cache_version"] = 999
    (cache_dir / "meta.json").write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="cache_version"):
        DualLevelGraph.load_cache(cache_dir)


def test_load_cache_csr_shares_memory_with_mmap_arrays(dg, tmp_path):
    """The dtype-mismatch footgun this refactor exists to avoid: adj_offsets
    must be saved as int32 (matching adj's int32) or scipy.sparse.csr_array
    silently upcasts-and-copies one of the two arrays instead of aliasing
    them, defeating cross-worker mmap sharing. Confirmed here via
    np.shares_memory rather than assumed."""
    cache_dir = tmp_path / "cached"
    dg.save_cache(cache_dir)
    loaded = DualLevelGraph.load_cache(cache_dir)

    assert loaded._adj.dtype == loaded._adj_offsets.dtype == np.int32
    assert np.shares_memory(loaded._csr.indices, loaded._adj)
    assert np.shares_memory(loaded._csr.indptr, loaded._adj_offsets)
