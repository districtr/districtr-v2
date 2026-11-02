import json

import networkx as nx
import numpy as np
import pytest
from networkx.readwrite import json_graph

from ensembles.chain import chain_config, pack
from ensembles.graph import POP_COL, SEED_COL
from ensembles.presets import PRESETS


@pytest.fixture
def graph_json(tmp_path):
    # Path a-b-c-d with populations 1,1,2,2 and one election column pair.
    g = nx.path_graph(["a", "b", "c", "d"])
    attrs = {
        "a": {POP_COL: 1, "e_dem": 5, "e_rep": 1, SEED_COL: 1},
        "b": {POP_COL: 1, "e_dem": 1, "e_rep": 5, SEED_COL: 1},
        "c": {POP_COL: 2, "e_dem": 2, "e_rep": 2, SEED_COL: 2},
        "d": {POP_COL: 2, "e_dem": 0, "e_rep": 4, SEED_COL: 2},
    }
    nx.set_node_attributes(g, attrs)
    path = tmp_path / "graph.json"
    path.write_text(json.dumps(json_graph.adjacency_data(g)))
    return path


def jsonl_record(**record) -> str:
    return json.dumps(record) + "\n"


def test_pack_rebuilds_plans_from_deltas(graph_json, tmp_path):
    config = {"n_steps": 2}
    jsonl = tmp_path / "run.jsonl"
    jsonl.write_text(
        jsonl_record(meta={"config": json.dumps(config)})
        + jsonl_record(
            init={
                "num_dists": 2,
                "populations": [2, 4],
                "sums": {"e_dem": [6, 2], "e_rep": [6, 6]},
                "num_cut_edges": 1,
            }
        )
        # Step: b moves from district 0 to district 1.
        + jsonl_record(
            step={
                "step": 1,
                "dists": [0, 1],
                "nodes": [[0], [1, 2, 3]],
                "populations": [1, 5],
                "sums": {"e_dem": [5, 3], "e_rep": [1, 11]},
                "num_cut_edges": 1,
                "counts": {},
            }
        )
    )
    out = tmp_path / "run.npz"
    facts = pack(graph_json, jsonl, out)
    saved = np.load(out)
    assert list(saved["node_ids"]) == ["a", "b", "c", "d"]
    assert saved["assignments"].tolist() == [[0, 0, 1, 1], [0, 1, 1, 1]]
    assert saved["populations"].tolist() == [[2, 4], [1, 5]]
    assert saved["sum_e_dem"].tolist() == [[6, 2], [5, 3]]
    assert saved["cut_edges"].tolist() == [1, 1]
    assert facts["n_plans"] == 2 and facts["num_dists"] == 2
    assert facts["rustrecom_config"] == config


def test_pack_rejects_tallies_that_do_not_add_up(graph_json, tmp_path):
    jsonl = tmp_path / "run.jsonl"
    jsonl.write_text(
        jsonl_record(meta={"config": json.dumps({"n_steps": 1})})
        + jsonl_record(
            init={
                "num_dists": 2,
                "populations": [2, 4],
                "sums": {"e_dem": [6, 3], "e_rep": [6, 6]},
                "num_cut_edges": 1,
            }
        )
    )
    with pytest.raises(AssertionError, match="e_dem"):
        pack(graph_json, jsonl, tmp_path / "run.npz")


def test_chain_config_carries_region_weights_only_for_region_aware(tmp_path):
    plain = chain_config(
        tmp_path / "g.json", PRESETS["recom_b"], 10, 1, 0.01, ["e_dem"], tmp_path / "o"
    )
    county = chain_config(
        tmp_path / "g.json",
        PRESETS["recom_b_county"],
        10,
        1,
        0.01,
        ["e_dem"],
        tmp_path / "o",
    )
    assert "region_weights" not in plain
    assert county["region_weights"] == {"county": 1.0}
    assert plain["variant"] == "district-pairs-mst"
    assert plain["writer"] == "jsonl-full" and plain["sum_cols"] == ["e_dem"]
