import json
import sys
import types

import numpy as np
import pytest
from click.testing import CliRunner

from ensembles import diag
from ensembles.cli import ensembles

N_PLANS = 25
N_NODES = 7
N_DISTS = 3
RANGE = 10


@pytest.fixture
def ensemble_dir(tmp_path):
    rng = np.random.default_rng(1)
    assignments = rng.integers(0, N_DISTS, size=(N_PLANS, N_NODES)).astype(np.uint8)
    node_ids = np.array([f"vtd:{i:03d}" for i in range(N_NODES)])
    np.savez_compressed(
        tmp_path / "county.npz",
        node_ids=node_ids,
        assignments=assignments,
        cut_edges=np.arange(N_PLANS, dtype=np.int32),
    )
    arrays = {
        "seats__pres_24": rng.integers(0, 4, N_PLANS),
        "rep_seats__pres_24": rng.integers(0, 4, N_PLANS),
        "disproportionality__pres_24": rng.normal(size=N_PLANS),
        "district_vote_shares__pres_24": rng.random((N_PLANS, N_DISTS)),
        "county_splits": np.arange(N_PLANS)[::-1].copy(),
        "polsby_popper": rng.random((N_PLANS, N_DISTS)),
        "polsby_popper_mean": rng.random(N_PLANS),
    }
    np.savez_compressed(
        tmp_path / "county.scores.npz",
        **arrays,
        elections=np.array(["pres_24"]),
        n_plans=N_PLANS,
    )
    (tmp_path / "county.json").write_text(
        json.dumps(
            {"module_slug": "xx", "label": "County", "region_weights": {"county": 0.5}}
        )
    )
    return tmp_path


def test_catalogue_lists_scalar_series_with_labels_and_elections(ensemble_dir):
    scores = diag.load_scores_for(ensemble_dir, "county")

    catalogue = {m["key"]: m for m in diag.metric_catalogue(scores)}

    assert catalogue["seats__pres_24"] == {
        "key": "seats__pres_24",
        "label": "Democratic seats, President 2024",
        "election": "pres_24",
    }
    assert catalogue["county_splits"]["election"] is None
    assert "cut_edges" in catalogue
    assert "district_vote_shares__pres_24" not in catalogue
    assert "polsby_popper" not in catalogue


def test_buckets_slice_ranks_and_hold_five_samples_each():
    values = np.arange(1000, dtype=float)[::-1].copy()  # step i has value 999 - i

    found = diag.metric_buckets(values, np.random.SeedSequence(0))

    labels = [b["label"] for b in found["buckets"]]
    assert labels == ["Bottom 1%", "1-10%", "10-90%", "90-99%", "Top 1%"]
    assert [b["range"] for b in found["buckets"]] == [
        [0, 9],
        [10, 99],
        [100, 899],
        [900, 989],
        [990, 999],
    ]
    for bucket in found["buckets"]:
        assert len(bucket["steps"]) == 5 == len(set(bucket["steps"]))
        lo, hi = bucket["range"]
        assert all(lo <= values[s] <= hi for s in bucket["steps"])
    assert found["min_step"] == 999 and found["max_step"] == 0


def test_buckets_of_tied_values_still_fill_every_bucket():
    found = diag.metric_buckets(np.full(1000, 3.0), np.random.SeedSequence(0))

    assert all(len(b["steps"]) == 5 for b in found["buckets"])
    assert found["min_step"] == 0 and found["max_step"] == 999


def test_buckets_skip_non_finite_values_and_tolerate_tiny_series():
    values = np.array([np.nan, 2.0, 1.0])

    found = diag.metric_buckets(values, np.random.SeedSequence(0))

    assert found["min_step"] == 2 and found["max_step"] == 1
    used = {s for b in found["buckets"] for s in b["steps"]}
    assert 0 not in used
    assert any(b["range"] is None and b["steps"] == [] for b in found["buckets"])


def test_buckets_are_deterministic_in_the_seed():
    values = np.random.default_rng(0).random(500)

    a = diag.metric_buckets(values, np.random.SeedSequence(5))
    b = diag.metric_buckets(values, np.random.SeedSequence(5))
    c = diag.metric_buckets(values, np.random.SeedSequence(6))

    assert a == b
    assert a != c


def test_assignments_round_trip_through_base64():
    block = np.random.default_rng(0).integers(0, 40, size=(4, 7)).astype(np.uint8)

    assert np.array_equal(
        diag.decode_assignments(diag.encode_assignments(block), 7), block
    )


def test_write_preset_splits_ranges_at_the_last_partial_one(ensemble_dir):
    out = diag.write_preset(ensemble_dir, "county", range_size=RANGE)

    files = sorted(p.name for p in (out / "steps").iterdir())
    assert files == ["0.json", "1.json", "2.json"]
    chain = np.load(ensemble_dir / "county.npz")["assignments"]
    last = json.loads((out / "steps" / "2.json").read_text())
    assert last["start"] == 20
    rows = diag.decode_assignments(last["assignments"], N_NODES)
    assert np.array_equal(rows, chain[20:])
    assert all(len(v) == 5 for v in last["metrics"].values())
    first = json.loads((out / "steps" / "0.json").read_text())
    assert np.array_equal(
        diag.decode_assignments(first["assignments"], N_NODES)[0], chain[0]
    )
    assert first["metrics"]["cut_edges"] == list(range(RANGE))
    nodes = json.loads((out / "nodes.json").read_text())
    assert nodes[0] == "vtd:000" and len(nodes) == N_NODES


def test_write_preset_index_describes_the_preset(ensemble_dir):
    out = diag.write_preset(ensemble_dir, "county", range_size=RANGE)

    index = json.loads((out / "index.json").read_text())

    assert index["module"] == "xx" and index["preset"] == "county"
    assert index["weights"] == {"county": 0.5}
    assert (index["n_plans"], index["n_districts"], index["n_nodes"]) == (
        N_PLANS,
        N_DISTS,
        N_NODES,
    )
    assert index["range_size"] == RANGE
    keys = [m["key"] for m in index["metrics"]]
    assert set(index["buckets"]) == set(keys) == set(index["min_step"])
    assert index["min_step"]["county_splits"] == N_PLANS - 1
    assert index["max_step"]["county_splits"] == 0


def test_write_index_lists_presets_and_keeps_an_existing_registry(ensemble_dir):
    diag.write_preset(ensemble_dir, "county", range_size=RANGE)
    folder = ensemble_dir / diag.DIAG_DIRNAME

    index = diag.write_index(folder, "xx")
    assert [p["key"] for p in index["presets"]] == ["county"]
    assert json.loads((folder / "registry.json").read_text()) == []

    (folder / "registry.json").write_text('[{"step": 1}]')
    diag.write_index(folder, "xx")
    assert json.loads((folder / "registry.json").read_text()) == [{"step": 1}]


def test_diag_package_command_then_publish_dry_run_with_prefix(
    ensemble_dir, monkeypatch, tmp_path
):
    monkeypatch.setitem(
        sys.modules,
        "core.settings",
        types.SimpleNamespace(settings=types.SimpleNamespace(S3_BUCKET="bucket")),
    )
    runner = CliRunner()
    made = runner.invoke(
        ensembles,
        [
            "diag-package",
            "--ensemble-dir",
            str(ensemble_dir),
            "--module-slug",
            "xx",
            "--preset",
            "county",
            "--range-size",
            str(RANGE),
        ],
    )
    assert made.exit_code == 0, made.output

    result = runner.invoke(
        ensembles,
        [
            "publish",
            "--module-slug",
            "xx",
            "--package-dir",
            str(ensemble_dir / diag.DIAG_DIRNAME),
            "--prefix",
            "ensembles-diag",
            "--alias",
            "xx_custom",
            "--dry-run",
        ],
    )

    assert result.exit_code == 0, result.output
    keys = {line.split("\t")[0] for line in result.output.splitlines() if "\t" in line}
    for name in (
        "index.json",
        "registry.json",
        "county/index.json",
        "county/nodes.json",
        "county/steps/2.json",
    ):
        assert f"s3://bucket/ensembles-diag/xx/{name}" in keys
    assert "s3://bucket/ensembles-diag/xx_custom/index.json" in keys
    assert not any("/ensembles/" in k for k in keys)
