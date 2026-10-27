import json

import numpy as np

from ensembles import analysis, optimize, package

from .test_package import _scores, _write_preset_manifest


def test_joint_marginals_match_distribution_for_integer_and_discrete_series():
    rng = np.random.default_rng(1)
    splits = rng.integers(10, 20, 500)
    disproportionality = rng.choice([-0.18, -0.056, 0.0685, 0.19], 500)
    arrays = {
        "county_splits": splits,
        "disproportionality__pres_24": disproportionality,
    }

    result = analysis.joint(
        analysis.ref("disproportionality", "pres_24"),
        analysis.ref("county_splits"),
        arrays,
        np.zeros(500, dtype=int),
    )

    x, y = package.distribution(disproportionality), package.distribution(splits)
    counts = np.array(result["counts"])
    assert (result["x_kind"], result["y_kind"]) == ("discrete", "integer")
    assert (result["x_edges"], result["y_edges"]) == (x["edges"], y["edges"])
    assert counts.sum(axis=0).tolist() == x["counts"]
    assert counts.sum(axis=1).tolist() == y["counts"]
    assert result["n"] == 500
    assert result["x"] == {
        "metric": "disproportionality",
        "election": "pres_24",
        "stat": None,
    }


def test_joint_buckets_continuous_series_into_fifty_equal_widths():
    rng = np.random.default_rng(2)
    pp = rng.uniform(0.2, 0.4, 1_000)
    cut_edges = rng.integers(3_000, 6_000, 1_000)  # an integer series too wide

    result = analysis.joint(
        analysis.ref("polsby_popper", stat="mean"),
        analysis.ref("cut_edges"),
        {"polsby_popper_mean": pp},
        cut_edges,
    )

    counts = np.array(result["counts"])
    assert result["x_kind"] == result["y_kind"] == "continuous"
    assert len(result["x_edges"]) == len(result["y_edges"]) == 51
    assert counts.shape == (50, 50)
    expected_x, _ = np.histogram(pp, bins=np.linspace(pp.min(), pp.max(), 51))
    expected_y, _ = np.histogram(
        cut_edges, bins=np.linspace(cut_edges.min(), cut_edges.max(), 51)
    )
    assert counts.sum(axis=0).tolist() == expected_x.tolist()
    assert counts.sum(axis=1).tolist() == expected_y.tolist()


def test_joint_counts_only_plans_where_both_series_are_finite():
    arrays = {
        "a": np.array([0.1, np.nan, 0.3, 0.3]),
        "county_splits": np.array([1, 2, 2, 3]),
    }

    result = analysis.joint(
        analysis.ref("a"), analysis.ref("county_splits"), arrays, np.zeros(4)
    )

    assert result["n"] == 3
    assert result["y_edges"] == [1, 2, 3, 4]
    assert result["counts"] == [[1, 0], [0, 1], [0, 1]]


def test_write_joint_lists_pairs_whose_series_exist(tmp_path, monkeypatch):
    monkeypatch.setattr(
        analysis,
        "JOINT_PAIRS",
        (
            (analysis.ref("county_splits"), analysis.ref("cut_edges"), "why"),
            (analysis.ref("seats", "pres_99"), analysis.ref("cut_edges"), "skip"),
        ),
    )
    scores = _scores()

    ids = analysis.write_joint(tmp_path, scores["arrays"], np.arange(4))

    index = json.loads((tmp_path / "joint" / "index.json").read_text())
    assert ids == ["county_splits__cut_edges"]
    assert index == {
        "pairs": [
            {
                "id": "county_splits__cut_edges",
                "x": analysis.ref("county_splits"),
                "y": analysis.ref("cut_edges"),
                "file": "joint/county_splits__cut_edges.json",
                "why": "why",
            }
        ]
    }
    assert (tmp_path / "joint" / "county_splits__cut_edges.json").exists()


def test_chunks_hold_every_plan_exactly_once(tmp_path, monkeypatch):
    monkeypatch.setattr(analysis, "CHUNK_SIZE", 3)
    scores = _scores(n_plans=10)
    assignments = np.tile(np.array([0, 1, 2, 2], dtype=np.uint8), (10, 1))

    n_chunks = analysis.write_chunks(
        tmp_path, assignments, scores, np.arange(10), "block", shuffle_seed=7
    )

    assert n_chunks == 4
    chunks = [
        json.loads((tmp_path / "chunks" / f"{k}.json").read_text()) for k in range(4)
    ]
    assert [c["chunk"] for c in chunks] == [0, 1, 2, 3]
    plans = [p for c in chunks for p in c["plans"]]
    assert sorted(p["plan"] for p in plans) == list(range(10))
    assert [p["plan"] for p in plans] == analysis.chunk_order(10, 7).tolist()
    assert [p["plan"] for p in plans] != list(range(10))
    first = plans[0]
    assert first["assignment"] == [1, 2, 3, 3]
    assert "plan" not in first["metrics"]
    assert first["metrics"]["cut_edges"] == {
        "cut_count": first["plan"],
        "unit_type": "block",
    }


def test_subsample_keeps_both_ends():
    assert analysis.subsample(5).tolist() == [0, 1, 2, 3, 4]
    picked = analysis.subsample(1_000)
    assert len(picked) == analysis.TRAJECTORY_STEPS
    assert picked[0] == 0 and picked[-1] == 999


def _run(n_rows=7):
    """A two-restart county-splits run over synthetic scores: restart 0 is rows
    0-3 (a chain 0-1-2-3), restart 1 rows 4-6; the best plan is row 3."""
    scores = _scores(n_plans=n_rows)
    rows = dict(scores["arrays"])
    rows["county_splits"] = np.array([9, 8, 7, 5, 9, 6, 6])
    rows["value"] = rows["county_splits"].astype(float)
    rows["cut_edges"] = np.arange(n_rows) + 100
    rows["parent"] = np.array([-1, 0, 1, 2, -1, 4, 5])
    rows["burst"] = np.array([0, 1, 1, 2, 0, 1, 1])
    rows["restart"] = np.array([0, 0, 0, 0, 1, 1, 1])
    rows["assignments"] = np.array(
        [[i % 3, (i + 1) % 3, 2, 0] for i in range(n_rows)], dtype=np.uint8
    )
    facts = {
        "method": "short_bursts",
        "burst_length": 10,
        "bursts": 500,
        "plateau": 150,
        "seeds": [0, 33333],
        "elections": scores["elections"],
        "cut_edges_unit_type": "block",
        "distinct": {"rows": [3, 5]},
        "restarts": [
            {"seed_plan": 0, "best_value": 5.0, "best_row": 3},
            {"seed_plan": 33333, "best_value": 6.0, "best_row": 5},
        ],
    }
    return {"rows": rows, "facts": facts}


class _StubThumbnails:
    def __init__(self):
        self.written = []

    def write(self, path, assignment):
        self.written.append(path)
        path.write_text("<svg/>")


def test_bounds_and_extremes_follow_the_package_contract(tmp_path):
    thumbs = _StubThumbnails()

    analysis.write_bounds(tmp_path, {"county_splits": _run()}, 3, thumbs)

    bounds = json.loads((tmp_path / "bounds.json").read_text())
    [entry] = bounds["objectives"]
    assert set(entry) == {
        "key",
        "label",
        "direction",
        "objective",
        "best_value",
        "restarts",
        "run",
        "plans",
    }
    assert entry["key"] == "county_splits"
    assert entry["direction"] == "min"
    assert entry["objective"] == optimize.OBJECTIVES["county_splits"].definition
    assert entry["best_value"] == 5
    assert entry["restarts"] == [5, 6]
    assert entry["run"] == {
        "method": "short_bursts",
        "burst_length": 10,
        "bursts": 500,
        "plateau": 150,
        "restarts": 2,
        "seeds": [0, 33333],
    }
    assert [p["file"] for p in entry["plans"]] == [
        "extremes/county_splits/0.json",
        "extremes/county_splits/1.json",
    ]
    assert [p["value"] for p in entry["plans"]] == [5, 6]
    assert set(entry["plans"][0]) == {"file", "thumb", "value", "metrics"}
    assert entry["plans"][0]["metrics"]["county_splits"]["splits"] == 5

    extreme = json.loads((tmp_path / entry["plans"][1]["file"]).read_text())
    assert set(extreme) == {"objective", "rank", "value", "assignment", "metrics"}
    assert extreme["rank"] == 2
    assert extreme["assignment"] == [3, 1, 3, 1]  # row 5, as zone numbers
    assert extreme["metrics"]["cut_edges"] == {"cut_count": 105, "unit_type": "block"}
    assert (tmp_path / entry["plans"][1]["thumb"]).exists()


def test_trajectory_follows_the_best_restart_from_seed_to_best(tmp_path):
    thumbs = _StubThumbnails()

    analysis.write_trajectories(tmp_path, {"county_splits": _run()}, 3, thumbs)

    result = json.loads((tmp_path / "trajectory" / "county_splits.json").read_text())
    assert result["objective"] == "county_splits"
    assert result["seed_plan"] == 0
    assert result["path_length"] == 4
    assert [s["value"] for s in result["steps"]] == [9, 8, 7, 5]
    assert [s["burst"] for s in result["steps"]] == [0, 1, 1, 2]
    assert set(result["steps"][0]) == {"burst", "value", "metrics", "thumb"}
    assert [s["thumb"] for s in result["steps"]] == [
        f"trajectory/county_splits/{i}.svg" for i in range(4)
    ]
    assert all((tmp_path / s["thumb"]).exists() for s in result["steps"])


def test_trajectory_subsamples_a_long_path(monkeypatch):
    monkeypatch.setattr(analysis, "TRAJECTORY_STEPS", 3)
    result = analysis.trajectory(
        optimize.OBJECTIVES["county_splits"], _run(), num_dists=3
    )
    # Positions 0, 1.5 and 3 of the four-step path, rounded half to even.
    assert [s["value"] for s in result["steps"]] == [9, 7, 5]


def test_write_index_carries_the_analysis_flags(tmp_path):
    _write_preset_manifest(tmp_path, "recom_b", "ReCom-B", 100)
    flags = {"bounds": True, "joint": True, "chunks": 1000, "trajectory": True}
    (tmp_path / "recom_b" / "config.json").write_text(json.dumps({"analysis": flags}))

    index = package.write_index(tmp_path, "co")

    assert index["presets"][0]["analysis"] == flags


def test_cut_edge_counter_sums_the_weights_of_cut_edges():
    counter = package.CutEdgeCounter(
        np.array([0, 1]), np.array([1, 2]), np.array([3, 5]), "block"
    )
    plans = np.array([[0, 0, 0], [0, 1, 1], [0, 0, 1], [0, 1, 0]], dtype=np.uint8)
    assert counter(plans).tolist() == [0, 3, 5, 8]
