"""Tests for DualLevelGraph: consistency checks over the committed npz
fixtures, plus hand-computed expectations on small inline graphs."""

import numpy as np
import pytest

from app.evaluation.dual_graph import DualLevelGraph
from app.evaluation.graph_loader import from_npz
from tests.conftest import _block_geoid
from tests.constants import FIXTURES_PATH
from tests.graph_helpers import make_graph


# ks_ellis_county_block: plain block adjacency graph (no attrs, larger)
# simple_geos: dual-level graph with parent/children/weighted_edges/ncp
# grid_child: plain block adjacency graph, smaller (8x8 grid)
# grid_shatterable: larger (80-node) dual-level graph, full attrs, mixed
#   bare-block/vtd:-prefixed id vocabulary — exercises searchsorted/dtype-width
#   behavior at a size the 9-node simple_geos fixture can't.
#
# The npz fixtures are written by the pipelines writer
# (pipelines/transforms/graph.py graph_to_npz_arrays), so loading them here
# also checks writer/reader schema compatibility across the two components.
FIXTURE_NAMES = [
    "ks_ellis_county_block",
    "simple_geos",
    "grid_child",
    "grid_shatterable",
]


def _fixture_path(name: str):
    return FIXTURES_PATH / "graph" / f"{name}.npz"


@pytest.fixture(scope="module", params=FIXTURE_NAMES)
def dg(request) -> DualLevelGraph:
    return from_npz(_fixture_path(request.param))


# -- fixture graphs: lookups ------------------------------------------------


def test_membership_and_len(dg):
    node_ids = dg._node_ids.tolist()
    assert len(dg) == len(node_ids)
    for node in node_ids:
        assert node in dg
    assert "not_a_node" not in dg
    # Longer than any stored id: must not false-positive via dtype truncation
    assert ("x" * 64) not in dg


def test_parents_and_children_agree(dg):
    """parents_of and children_of are two views of one relation."""
    node_ids = dg._node_ids.tolist()
    parents = dg.parents_of(node_ids)
    for node, parent in zip(node_ids, parents):
        if parent is not None:
            assert node in dg.children_of(parent)
    for node in node_ids:
        children = dg.children_of(node)
        assert isinstance(children, frozenset)
        assert dg.parents_of(list(children)) == [node] * len(children)
    # Unknown ids map to None, same as a LEFT JOIN miss
    assert dg.parents_of(["not_a_node"]) == [None]
    assert dg.parents_of([]) == []
    with pytest.raises(KeyError):
        dg.children_of("not_a_node")


def test_num_children_of_matches_children_of(dg):
    for node in dg._node_ids.tolist():
        assert dg.num_children_of(node) == len(dg.children_of(node))
    # Unknown ids and non-parents return 0 (doesn't raise, unlike children_of)
    assert dg.num_children_of("not_a_node") == 0


def test_is_shattered_parent_matches_children_of(dg):
    for node in dg._node_ids.tolist():
        assert dg.is_shattered_parent(node) == bool(dg.children_of(node))
    # Unknown ids are not shattered parents (predicate, doesn't raise)
    assert dg.is_shattered_parent("not_a_node") is False


def test_simple_geos_structure():
    """Known shape of simple_geos: 3 VTDs over 6 blocks."""
    dg = from_npz(_fixture_path("simple_geos"))
    blocks = {f"00001000000000{i}" for i in range(1, 7)}
    vtds = {"vtd:000010000001", "vtd:000010000002", "vtd:000010000003"}
    assert set(dg._node_ids.tolist()) == blocks | vtds
    assert set(dg.parents_of(sorted(blocks))) <= vtds
    assert sum(dg.num_children_of(v) for v in vtds) == len(blocks)


# -- fixture graphs: connectivity -------------------------------------------


def _cells(*rcs: tuple[int, int]) -> set[str]:
    """grid_child geo_ids by (row, col) on its 8x8 rook-adjacency grid."""
    return {_block_geoid(r, c) for r, c in rcs}


def _blocks(*ns: int) -> set[str]:
    """simple_geos block geo_ids by trailing digit."""
    return {f"00001000000000{n}" for n in ns}


# (fixture, subset, expected components). grid_child is an 8x8 grid where
# each cell touches only its 4 side neighbors, and its sorted geo_id order
# jumps around the grid — so subsets exercise scattered index positions.
# simple_geos is the dual-level graph drawn in test_contiguity.py.
COMPONENT_CASES = [
    ("grid_child", _cells((0, 0), (1, 1)), [_cells((0, 0)), _cells((1, 1))]),
    (
        "grid_child",
        _cells(*[(0, c) for c in range(4)], *[(2, c) for c in range(4)]),
        [_cells(*[(0, c) for c in range(4)]), _cells(*[(2, c) for c in range(4)])],
    ),
    (
        "grid_child",
        _cells((0, 0), (1, 0), (2, 0), (2, 1), (2, 2)),
        [_cells((0, 0), (1, 0), (2, 0), (2, 1), (2, 2))],
    ),
    (  # block 6 and vtd 1 share an edge across the two levels
        "simple_geos",
        _blocks(6) | {"vtd:000010000001"},
        [_blocks(6) | {"vtd:000010000001"}],
    ),
    (
        "simple_geos",
        _blocks(4) | {"vtd:000010000003"},
        [_blocks(4), {"vtd:000010000003"}],
    ),
]


@pytest.mark.parametrize("name,subset,expected", COMPONENT_CASES)
def test_connected_components_hand_specified(name, subset, expected):
    dg = from_npz(_fixture_path(name))
    got = {frozenset(c) for c in dg.connected_components(subset)}
    assert got == {frozenset(c) for c in expected}
    assert dg.number_connected_components(subset) == len(expected)
    assert dg.is_connected(subset) == (len(expected) == 1)


def test_unknown_ids_silently_dropped(dg):
    subset = dg._node_ids.tolist()[:5]
    with_unknowns = subset + ["missing_1", "missing_2"]
    assert {frozenset(c) for c in dg.connected_components(with_unknowns)} == {
        frozenset(c) for c in dg.connected_components(subset)
    }


def test_empty_subgraph_raises(dg):
    assert dg.connected_components([]) == []
    assert dg.number_connected_components(["missing"]) == 0
    with pytest.raises(ValueError):
        dg.is_connected([])


def test_component_ids_are_native_str(dg):
    subset = dg._node_ids.tolist()[:20]
    for component in dg.connected_components(subset):
        for node in component:
            assert node.__class__ is str


# -- small inline graphs ----------------------------------------------------


def test_non_shatterable_graph():
    """Plain edge graphs (no parents / weighted_edges / ncp)."""
    dg = make_graph(edges=[("a", "b"), ("b", "c"), ("d", "e")])
    assert dg.parents_of(["a"]) == [None]
    assert dg.children_of("a") == frozenset()
    assert dg.is_shattered_parent("a") is False
    assert dg.number_connected_components(["a", "b", "c", "d", "e"]) == 2
    assert dg.is_connected(["a", "b", "c"])
    assert not dg.is_connected(["a", "c"])


def test_single_node_no_edges():
    dg = make_graph(nodes=["only"])
    assert "only" in dg
    assert dg.is_connected(["only"])


def test_is_shattered_parent_direct_construction():
    dg = make_graph(
        edges=[("a", "b")],
        nodes=["p2"],  # parent-shaped id, but never shattered (no children)
        parents={"a": "p1", "b": "p1"},
    )
    assert dg.is_shattered_parent("p1") is True
    assert dg.is_shattered_parent("p2") is False
    assert dg.is_shattered_parent("a") is False  # a child, not a parent
    assert dg.is_shattered_parent("nope") is False


# -- expand_non_contiguous -------------------------------------------------


def _ncp_graph() -> DualLevelGraph:
    return make_graph(
        edges=[("a", "b"), ("c", "d")],
        parents={"a": "p1", "b": "p1"},
        non_contiguous_parents={"p1"},
    )


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
    dg = from_npz(_fixture_path("simple_geos"))

    unit_to_zone = {"000010000000001": 1, "000010000000005": 2}
    parent_unit_to_zone = {"vtd:000010000002": 1, "vtd:000010000003": 2}
    assert dg.cut_edges(unit_to_zone, parent_unit_to_zone) == 3


def test_cut_edges_no_weighted_edges_falls_back_to_unit_pass_only():
    """Non-shatterable maps (no weighted_edges) skip Step 1 entirely — every
    assignment is a plain unit, exactly like the pre-refactor algorithm's
    non-shatterable branch."""
    dg = make_graph(edges=[("a", "b"), ("b", "c"), ("c", "d")])

    # a-b cut, b-c not cut, c-d cut
    unit_to_zone = {"a": 1, "b": 1, "c": 2, "d": 1}
    assert dg.cut_edges(unit_to_zone, {}) == 2


def test_cut_edges_empty_assignment():
    dg = from_npz(_fixture_path("simple_geos"))
    assert dg.cut_edges({}, {}) == 0


# -- from_npz ---------------------------------------------------------------


def test_from_npz_rejects_unknown_version(tmp_path):
    bad = tmp_path / "bad.npz"
    np.savez(bad, format_version=np.int32(999))
    with pytest.raises(ValueError, match="format_version"):
        from_npz(bad)


# -- shared mmap disk cache ---------------------------------------------------


def test_save_load_cache_round_trip(dg, tmp_path):
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


def test_save_cache_second_write_is_a_noop_not_a_race(dg, tmp_path):
    """Not an actual concurrent race (single thread, sequential calls) --
    exercises the loser-writer branch of the OSError handler: a second
    save_cache against an already-populated cache_dir must not fail or
    corrupt the existing cache, and must not leave its own tmp dir behind."""
    cache_dir = tmp_path / "cached"
    dg.save_cache(cache_dir)
    # Second write hits the same cache_dir, already populated with valid
    # content -- the rename fails ENOTEMPTY and the handler takes the
    # loser path (meta.json exists, so it cleans up and returns quietly).
    dg.save_cache(cache_dir)
    loaded = DualLevelGraph.load_cache(cache_dir)
    assert loaded._node_ids.tolist() == dg._node_ids.tolist()
    assert not list(tmp_path.glob("cached.tmp-*"))


def test_save_cache_mid_write_failure_installs_nothing(dg, tmp_path, monkeypatch):
    """A failure while writing tmp_dir (e.g. ENOSPC) must propagate and leave
    no trace -- not get silently treated as an ENOTEMPTY self-heal case and
    have the incomplete tmp_dir installed as cache_dir. Regression test: an
    earlier version of the self-heal fix wrapped the whole write in the same
    except OSError that also handles the rename-failed case, so a write
    failure with no prior cache present looked identical to "stale cache_dir
    blocking the rename" and got renamed into place anyway, missing files."""
    cache_dir = tmp_path / "cached"
    real_save = np.save
    calls = {"n": 0}

    def flaky_save(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise OSError("simulated ENOSPC")
        return real_save(*args, **kwargs)

    monkeypatch.setattr(np, "save", flaky_save)
    with pytest.raises(OSError, match="simulated ENOSPC"):
        dg.save_cache(cache_dir)

    assert not cache_dir.exists()
    assert not list(tmp_path.glob("cached.tmp-*"))


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
