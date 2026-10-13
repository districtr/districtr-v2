import json
import xml.etree.ElementTree as ET

import numpy as np
import pytest
import shapely
from shapely.geometry import Point, box

from ensembles import package

SVG_NS = "{http://www.w3.org/2000/svg}"


def test_distribution_of_an_integer_series_has_one_bucket_per_integer():
    result = package.distribution(np.array([2, 2, 3, 5]))

    assert result["kind"] == "integer"
    assert result["edges"] == [2, 3, 4, 5, 6]
    assert result["counts"] == [2, 1, 0, 1]
    assert (result["min"], result["max"], result["median"]) == (2, 5, 2.5)
    assert "quantiles" not in result


def test_distribution_of_a_continuous_series_has_equal_width_buckets_and_quantiles():
    values = np.linspace(0.0, 1.0, 401)

    result = package.distribution(values)

    assert result["kind"] == "continuous"
    assert len(result["edges"]) == package.CONTINUOUS_BUCKETS + 1
    assert result["edges"][0] == 0.0 and result["edges"][-1] == 1.0
    assert len(result["counts"]) == package.CONTINUOUS_BUCKETS
    assert sum(result["counts"]) == 401
    assert result["counts"][-1] >= 1  # the last bucket includes max
    assert len(result["quantiles"]) == 201
    assert result["quantiles"][0] == 0.0
    assert result["quantiles"][100] == 0.5
    assert result["quantiles"][-1] == 1.0
    assert result["median"] == 0.5


def test_distribution_of_a_constant_float_series_is_one_discrete_value():
    result = package.distribution(np.full(5, 0.25))

    assert result["kind"] == "discrete"
    assert result["edges"] == [0.25]
    assert result["counts"] == [5]


def test_distribution_excludes_and_counts_non_finite_values():
    result = package.distribution(np.array([0.1, np.nan, 0.3]))

    assert sum(result["counts"]) == 2
    assert result["n_missing"] == 1


def test_ftv_elections_takes_the_two_latest_presidential_and_senate_contests():
    elections = ["ag_18", "gov_18", "pres_16", "pres_20", "pres_24", "sen_16", "sen_20"]

    assert package.ftv_elections(elections) == [
        "pres_24",
        "pres_20",
        "sen_20",
        "sen_16",
    ]
    assert package.ftv_elections(["pres_20", "pres_24", "sen_20"]) is None


def test_ftv_summary_counts_plans_passing_three_of_four_elections():
    # 8 districts: threshold max(0.07, 1/8) = 0.125. Plan 0 passes all four,
    # plan 1 three (one value sits exactly on the threshold), plan 2 two,
    # plan 3 none.
    disproportionality = {
        "pres_24": np.array([0.0, 0.125, 0.0, 0.3]),
        "pres_20": np.array([0.1, -0.1, 0.2, -0.3]),
        "sen_20": np.array([-0.1, 0.05, -0.2, 0.3]),
        "sen_16": np.array([0.05, 0.2, 0.1, 0.3]),
        "gov_18": np.array([0.5, 0.5, 0.5, 0.5]),
    }
    elections = ["gov_18", "pres_20", "pres_24", "sen_16", "sen_20"]

    result = package.ftv_summary(disproportionality, elections, num_dists=8)

    assert result == {
        "elections": ["pres_24", "pres_20", "sen_20", "sen_16"],
        "threshold": 0.125,
        "share_passing": 0.5,
    }


def test_ftv_threshold_is_at_least_seven_percent():
    shares = {e: np.array([0.0]) for e in ("pres_20", "pres_24", "sen_18", "sen_20")}

    result = package.ftv_summary(shares, sorted(shares), num_dists=20)

    assert result["threshold"] == 0.07


def _scores(n_plans=4):
    """Synthetic scores for 3 districts and 2 elections."""
    rng = np.random.default_rng(0)
    elections = ["pres_24", "sen_20"]
    arrays = {}
    for e in elections:
        arrays[f"seats__{e}"] = np.full(n_plans, 2)
        arrays[f"rep_seats__{e}"] = np.full(n_plans, 1)
        for metric in package.PER_ELECTION_SEGMENT:
            arrays[f"{metric}__{e}"] = rng.normal(0, 0.1, n_plans)
    arrays["district_vote_shares__pres_24"] = np.tile([0.6, 0.55, 0.4], (n_plans, 1))
    arrays["district_vote_shares__sen_20"] = np.tile([0.7, 0.45, 0.3], (n_plans, 1))
    arrays["n_dem_districts"] = np.full(n_plans, 1)
    arrays["n_rep_districts"] = np.full(n_plans, 1)
    arrays["n_swing_districts"] = np.full(n_plans, 1)
    arrays["n_competitive_contests"] = np.full(n_plans, 0)
    arrays["county_splits"] = np.arange(n_plans)
    arrays["county_pieces"] = np.arange(n_plans) + 10
    for metric in package.COMPACTNESS:
        arrays[metric] = rng.uniform(0.1, 0.5, (n_plans, 3))
        for agg in package.COMPACTNESS_AGGREGATES:
            arrays[f"{metric}_{agg}"] = getattr(arrays[metric], agg)(axis=1)
    return {
        "arrays": arrays,
        "elections": elections,
        "n_plans": n_plans,
        "num_dists": 3,
    }


def test_segment_step_matches_the_app_evaluation_shape():
    scores = _scores()
    cut_edges = np.array([10, 11, 12, 13])

    step = package.segment_step(scores, cut_edges, plan=2)

    assert step["plan"] == 2
    assert step["seats"] == {
        "pres_24": {"dem": 2, "rep": 1, "total": 3},
        "sen_20": {"dem": 2, "rep": 1, "total": 3},
    }
    for metric in package.PER_ELECTION_SEGMENT:
        assert set(step[metric]) == {"pres_24", "sen_20"}
        assert isinstance(step[metric]["pres_24"], float)
    assert step["competitiveness"] == {
        "dem_sweep_districts": [1],
        "rep_sweep_districts": [3],
        "swing_districts": [2],
        "contest_dem_vote_shares": [0.3, 0.4, 0.45, 0.55, 0.6, 0.7],
        "n_districts": 3,
        "n_elections": 2,
    }
    for metric in package.COMPACTNESS:
        assert list(step[metric]) == ["1", "2", "3"]
    assert step["cut_edges"] == {"cut_count": 12, "unit_type": "vtd"}
    assert step["county_splits"] == {"splits": 2, "pieces": 12}


def test_segment_step_rejects_sweeps_that_disagree_with_gerrytools():
    scores = _scores()
    scores["arrays"]["n_dem_districts"][1] = 2

    with pytest.raises(AssertionError):
        package.segment_step(scores, np.zeros(4, dtype=int), plan=1)


def test_segment_holds_consecutive_plans_from_start(monkeypatch):
    monkeypatch.setattr(package, "SEGMENT_LENGTH", 2)
    scores = _scores()

    result = package.segment(scores, np.arange(4), start=1)

    assert result["start"] == 1
    assert [s["plan"] for s in result["steps"]] == [1, 2]


def test_segment_start_moves_back_for_a_short_ensemble():
    assert package.segment_start(1_000, 50_000) == 1_000 - package.SEGMENT_LENGTH
    assert package.segment_start(100_000, 50_000) == 50_000


def test_summary_covers_every_series():
    scores = _scores()
    cut_edges = np.array([10, 11, 12, 13])

    result = package.summary(scores, cut_edges)

    assert result["n_plans"] == 4 and result["num_dists"] == 3
    for metric in package.PER_ELECTION_SUMMARY:
        assert set(result[metric]) == {"pres_24", "sen_20"}
    for metric in package.PLAN_SUMMARY:
        assert result[metric]["kind"] == "integer"
    for metric in package.COMPACTNESS:
        assert set(result[metric]) == {"mean", "min", "max", "districts"}
    assert "ftv" not in result  # needs two presidential and two Senate contests


def _parse_svg(svg):
    root = ET.fromstring(svg)
    return root, root.findall(f".//{SVG_NS}path")


def test_thumbnail_svg_draws_one_coloured_path_per_district():
    districts = [box(0, 0, 1000, 1000), box(1000, 0, 2000, 1000)]

    svg = package.thumbnail_svg(districts, (0, 0, 2000, 1000))

    root, paths = _parse_svg(svg)
    assert root.get("viewBox") == f"0 0 {package.THUMB_VIEWBOX_WIDTH} 500"
    assert [p.get("data-district") for p in paths] == ["1", "2"]
    assert [p.get("fill") for p in paths] == list(package.ZONE_COLORS[:2])
    assert root.find(f"{SVG_NS}g").get("stroke") == "#fff"
    assert "<text" not in svg
    # y points down: the bottom edge (y = 0 in map units) sits at the viewBox's bottom
    assert paths[0].get("d").startswith("M") and " 500" in paths[0].get("d")


def test_thumbnail_svg_simplifies_until_it_fits():
    circle = Point(0, 0).buffer(1000, quad_segs=500)
    halves = [
        circle.intersection(box(-1000, -1000, 0, 1000)),
        circle.intersection(box(0, -1000, 1000, 1000)),
    ]
    bounds = tuple(shapely.total_bounds(np.array(halves)))

    svg = package.thumbnail_svg(halves, bounds, max_bytes=2_000)

    assert len(svg.encode()) <= 2_000
    assert len(_parse_svg(svg)[1]) == 2


def _write_preset_manifest(package_dir, key, label, n_plans):
    folder = package_dir / key
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(
        json.dumps(
            {
                "generated_at": "2026-10-13T00:00:00+00:00",
                "chain": {"label": label},
                "scoring": {"n_plans": n_plans},
            }
        )
    )


def test_write_index_lists_presets_in_preset_order_with_the_default_marked(tmp_path):
    _write_preset_manifest(tmp_path, "recom_b_county", "ReCom-B, county-aware", 90)
    _write_preset_manifest(tmp_path, "recom_b", "ReCom-B", 100)

    package.write_index(tmp_path, "co_congressional_districts_v2")

    index = json.loads((tmp_path / "index.json").read_text())
    assert index == {
        "module_slug": "co_congressional_districts_v2",
        "presets": [
            {
                "key": "recom_b",
                "label": "ReCom-B",
                "default": True,
                "n_plans": 100,
                "generated_at": "2026-10-13T00:00:00+00:00",
            },
            {
                "key": "recom_b_county",
                "label": "ReCom-B, county-aware",
                "default": False,
                "n_plans": 90,
                "generated_at": "2026-10-13T00:00:00+00:00",
            },
        ],
    }


def test_upload_targets_key_every_file_under_the_module(tmp_path):
    (tmp_path / "recom_b" / "thumbs").mkdir(parents=True)
    (tmp_path / "index.json").write_text("{}")
    (tmp_path / "recom_b" / "thumbs" / "000.svg").write_text("<svg/>")

    targets = package.upload_targets(tmp_path, "co")

    assert [key for _, key in targets] == [
        "ensembles/co/index.json",
        "ensembles/co/recom_b/thumbs/000.svg",
    ]
    assert package.content_type(targets[1][0]) == "image/svg+xml"


def test_public_manifest_reduces_local_paths_to_file_names():
    manifest = {
        "graph_json": "/data/co/graph.json",
        "seed": {"source": "/data/CO.csv", "repairs": []},
        "rustrecom_config": {
            "graph_json": "/data/co/graph.json",
            "output_file": "/data/co/recom_b.jsonl",
            "n_steps": 10,
        },
    }

    result = package._public_manifest(manifest, ("graph_json",))

    assert result["graph_json"] == "graph.json"
    assert result["seed"]["source"] == "CO.csv"
    assert result["rustrecom_config"] == {
        "graph_json": "graph.json",
        "output_file": "recom_b.jsonl",
        "n_steps": 10,
    }


def test_block_cut_edges_sums_block_adjacencies_across_cut_vtd_edges(tmp_path):
    # Path a-b-c with 3, 5 and 7 block adjacencies between neighbours; the
    # graph lists VTDs in a different order from the ensemble.
    graph = tmp_path / "graph.npz"
    np.savez(
        graph,
        node_ids=np.array(["c", "a", "b"]),
        has_weighted_edges=np.bool_(True),
        we_keys=np.array([[1, 2], [2, 0]], dtype=np.int32),
        we_vals=np.array([3, 5], dtype=np.int32),
    )
    node_ids = np.array(["a", "b", "c"])
    assignments = np.array([[0, 0, 0], [0, 1, 1], [0, 0, 1], [0, 1, 0]], dtype=np.uint8)
    counts = package.block_cut_edges(assignments, node_ids, graph)
    assert counts.tolist() == [0, 3, 5, 8]


def test_block_cut_edges_refuses_graph_without_weights(tmp_path):
    graph = tmp_path / "graph.npz"
    np.savez(
        graph,
        node_ids=np.array(["a"]),
        has_weighted_edges=np.bool_(False),
        we_keys=np.empty((0, 2), dtype=np.int32),
        we_vals=np.empty(0, dtype=np.int32),
    )
    with pytest.raises(ValueError, match="no block-edge weights"):
        package.block_cut_edges(
            np.zeros((1, 1), dtype=np.uint8), np.array(["a"]), graph
        )


def test_distribution_stores_few_valued_float_series_as_exact_values():
    values = np.array([-0.0565, 0.0685, 0.0685, 0.1935, 0.0685, -0.0565])
    dist = package.distribution(values)
    assert dist["kind"] == "discrete"
    assert dist["edges"] == [-0.0565, 0.0685, 0.1935]
    assert dist["counts"] == [2, 3, 1]
    assert "quantiles" not in dist
    assert dist["median"] == 0.0685


def test_distribution_keeps_many_valued_float_series_continuous():
    dist = package.distribution(np.linspace(0, 1, 500))
    assert dist["kind"] == "continuous"
    assert len(dist["counts"]) == package.CONTINUOUS_BUCKETS
