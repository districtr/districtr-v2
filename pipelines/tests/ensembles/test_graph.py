import networkx as nx
import pytest

from ensembles.graph import POP_COL, county_of, repair_seed


def grid(width: int, height: int, pop: int = 1) -> nx.Graph:
    g = nx.grid_2d_graph(width, height)
    g = nx.relabel_nodes(g, {n: f"vtd:{n[0]}{n[1]}" for n in g})
    nx.set_node_attributes(g, pop, POP_COL)
    return g


def test_county_of_strips_prefix():
    assert county_of("vtd:08001001001") == "08001"
    assert county_of("080010078011000") == "08001"


def test_repair_seed_flips_bridge_for_large_fragment():
    # Two columns: district 1 on the left column, district 2 on the right,
    # except the middle-left cell, which cuts district 1 into two pieces of
    # four and five cells. Flipping it back reconnects district 1.
    g = grid(2, 10)
    seed = {n: (1 if n.startswith("vtd:0") else 2) for n in g}
    seed["vtd:04"] = 2
    log = repair_seed(g, seed)
    assert seed["vtd:04"] == 1
    assert log == ["district 1: flipped bridge vtd:04 from 2"]
    for k in (1, 2):
        assert nx.is_connected(g.subgraph([n for n in g if seed[n] == k]))


def test_repair_seed_moves_small_fragment_to_neighbour():
    g = grid(2, 4)
    seed = {n: (1 if n.startswith("vtd:0") else 2) for n in g}
    seed["vtd:13"] = 1  # a lone district-1 cell inside district 2's column
    seed["vtd:03"] = 2  # ...whose only district-1 neighbour was handed over
    log = repair_seed(g, seed)
    assert seed["vtd:13"] == 2
    assert log == ["district 1: moved 1 VTD(s) to 2"]
    for k in (1, 2):
        assert nx.is_connected(g.subgraph([n for n in g if seed[n] == k]))


def test_repair_seed_leaves_contiguous_seed_alone():
    g = grid(2, 3)
    seed = {n: (1 if n.startswith("vtd:0") else 2) for n in g}
    assert repair_seed(g, seed) == []


def test_repair_seed_raises_when_a_piece_has_no_neighbours():
    g = nx.Graph()
    g.add_nodes_from(["a", "b"])  # two isolated cells in one district
    nx.set_node_attributes(g, 1, POP_COL)
    with pytest.raises(ValueError, match="no neighbours"):
        repair_seed(g, {"a": 1, "b": 1})
