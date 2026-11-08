"""Build the diagnosis package: any plan of an ensemble, loadable by step index.

Layout under ``<ensemble dir>/diag/``:

- ``index.json`` — module slug and the preset folders (same shape as the
  package's ``index.json``, so ``package.alias_index`` applies to it).
- ``registry.json`` — ``[{preset, step, public_id, note, when}]``, the shared
  list of plans opened in the app. Created empty and never overwritten.
- ``<preset>/index.json`` — module, preset and weights, plan, district and node
  counts, ``range_size``, the metric catalogue and the quantile buckets.
- ``<preset>/nodes.json`` — unit ids in assignment-column order.
- ``<preset>/steps/<k>.json`` — plans ``k * range_size`` onward (the last file
  may hold fewer): ``{start, assignments, metrics}``. ``assignments`` is the
  base64 of a row-major ``rows x n_nodes`` uint8 block, one row per plan, each
  value the chain's 0-based district label (the app's zone is value + 1).
  ``metrics`` maps each catalogue key to one value per row.

Step ``i`` is the chain's plan ``i``; step 0 is the seed (the enacted plan).
"""

import base64
import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from ensembles import package
from ensembles.presets import PRESETS

logger = logging.getLogger(__name__)

DIAG_DIRNAME = "diag"
RANGE_SIZE = 1000
SAMPLES_PER_BUCKET = 5
SAMPLE_SEED = 20261108
REGISTRY_FILENAME = "registry.json"

# (label, lower rank fraction, upper rank fraction) over plans sorted ascending.
BUCKETS = (
    ("Bottom 1%", 0.0, 0.01),
    ("1-10%", 0.01, 0.10),
    ("10-90%", 0.10, 0.90),
    ("90-99%", 0.90, 0.99),
    ("Top 1%", 0.99, 1.0),
)

ELECTION_METRICS = {
    "seats": "Democratic seats",
    "rep_seats": "Republican seats",
    "efficiency_gap": "Efficiency gap",
    "mean_median": "Mean-median difference",
    "partisan_bias": "Partisan bias",
    "disproportionality": "Disproportionality",
    "eguia": "Eguia",
}
PLAN_METRICS = {
    "n_dem_districts": "Democratic-sweep districts",
    "n_rep_districts": "Republican-sweep districts",
    "n_swing_districts": "Swing districts",
    "n_competitive_contests": "Competitive contests",
    "county_splits": "County splits",
    "county_pieces": "County pieces",
    "cut_edges": "Cut edges",
}
COMPACTNESS_LABELS = {"polsby_popper": "Polsby-Popper", "reock": "Reock"}
OFFICES = {
    "pres": "President",
    "sen": "Senate",
    "gov": "Governor",
    "ag": "Attorney General",
}


def election_label(election: str) -> str:
    office, _, year = election.rpartition("_")
    return f"{OFFICES.get(office, office)} 20{year}" if year.isdigit() else election


def metric_catalogue(scores: dict) -> list[dict]:
    """``[{key, label, election}]`` for every scalar per-plan series the scores
    hold, plus ``cut_edges``. Keys are the scores' array names."""
    arrays = scores["arrays"]
    out = []
    for metric, label in ELECTION_METRICS.items():
        for election in scores["elections"]:
            key = f"{metric}__{election}"
            if key in arrays:
                out.append(
                    {
                        "key": key,
                        "label": f"{label}, {election_label(election)}",
                        "election": election,
                    }
                )
    for key, label in PLAN_METRICS.items():
        if key == "cut_edges" or key in arrays:
            out.append({"key": key, "label": label, "election": None})
    for metric, label in COMPACTNESS_LABELS.items():
        for stat in package.COMPACTNESS_AGGREGATES:
            key = f"{metric}_{stat}"
            if key in arrays:
                out.append({"key": key, "label": f"{label} ({stat})", "election": None})
    return out


def _json_values(values: np.ndarray) -> list:
    if values.dtype.kind in "iu":
        return values.tolist()
    return [package._round(v) if np.isfinite(v) else None for v in values]


def _json_number(x):
    return int(x) if isinstance(x, (np.integer, int)) else package._round(x)


def metric_buckets(values: np.ndarray, rng_seed: np.random.SeedSequence) -> dict:
    """The buckets and extreme steps of one per-plan series.

    Plans with a finite value are ranked ascending, ties by step index, and each
    bucket takes its rank slice (``BUCKETS``; boundaries ``round(n * fraction)``),
    so a tied integer series still fills every bucket. ``range`` is the lowest and
    highest value in the slice, ``steps`` up to ``SAMPLES_PER_BUCKET`` of its
    plans drawn without replacement, ascending; an empty slice has ``range`` null
    and no steps."""
    finite = np.flatnonzero(np.isfinite(values))
    order = finite[np.argsort(values[finite], kind="stable")]
    n = len(order)
    children = rng_seed.spawn(len(BUCKETS))
    buckets = []
    for (label, lo_frac, hi_frac), child in zip(BUCKETS, children, strict=True):
        lo, hi = round(n * lo_frac), round(n * hi_frac)
        members = order[lo:hi]
        if len(members) == 0:
            buckets.append(
                {
                    "label": label,
                    "range": None,
                    "quantiles": [lo_frac, hi_frac],
                    "steps": [],
                }
            )
            continue
        pick = np.random.default_rng(child).choice(
            len(members), size=min(SAMPLES_PER_BUCKET, len(members)), replace=False
        )
        buckets.append(
            {
                "label": label,
                "range": [
                    _json_number(values[members[0]]),
                    _json_number(values[members[-1]]),
                ],
                "quantiles": [lo_frac, hi_frac],
                "steps": sorted(int(members[i]) for i in pick),
            }
        )
    return {
        "buckets": buckets,
        "min_step": int(order[0]) if n else None,
        "max_step": int(order[-1]) if n else None,
    }


def encode_assignments(block: np.ndarray) -> str:
    """Base64 of a ``rows x n_nodes`` uint8 block, row-major."""
    return base64.b64encode(np.ascontiguousarray(block, dtype=np.uint8)).decode("ascii")


def decode_assignments(data: str, n_nodes: int) -> np.ndarray:
    return np.frombuffer(base64.b64decode(data), dtype=np.uint8).reshape(-1, n_nodes)


def range_file(
    assignments: np.ndarray, series: dict[str, np.ndarray], start: int, range_size: int
) -> dict:
    """``steps/<start // range_size>.json`` for plans ``start`` to ``start +
    range_size`` (clipped to the ensemble)."""
    stop = min(start + range_size, len(assignments))
    return {
        "start": start,
        "assignments": encode_assignments(assignments[start:stop]),
        "metrics": {key: _json_values(v[start:stop]) for key, v in series.items()},
    }


def write_preset(
    ensemble_dir: str | Path,
    preset_key: str,
    range_size: int = RANGE_SIZE,
    seed: int = SAMPLE_SEED,
    graph_npz: str | Path | None = None,
) -> Path:
    """Write ``diag/<preset>/`` from ``<preset>.npz``, ``<preset>.scores.npz`` and
    the chain manifest in ``ensemble_dir``; returns the preset folder. With
    ``graph_npz`` cut edges are counted between blocks (see ``package``)."""
    ensemble_dir = Path(ensemble_dir)
    out = ensemble_dir / DIAG_DIRNAME / preset_key
    (out / "steps").mkdir(parents=True, exist_ok=True)

    chain_npz = np.load(ensemble_dir / f"{preset_key}.npz")
    node_ids = chain_npz["node_ids"]
    assignments = chain_npz["assignments"]
    scores = load_scores_for(ensemble_dir, preset_key)
    n_plans = scores["n_plans"]
    if len(assignments) < n_plans:
        raise ValueError(
            f"{preset_key}: {n_plans} scored plans, {len(assignments)} in chain"
        )
    assignments = assignments[:n_plans]
    if graph_npz is not None:
        cut_edges = package.block_cut_edges(assignments, node_ids, graph_npz)
        cut_edges_unit = "block"
    else:
        cut_edges = chain_npz["cut_edges"][:n_plans]
        cut_edges_unit = "vtd"

    catalogue = metric_catalogue(scores)
    series = {m["key"]: scores["arrays"].get(m["key"]) for m in catalogue}
    series["cut_edges"] = cut_edges
    manifest = json.loads((ensemble_dir / f"{preset_key}.json").read_text())

    root = np.random.SeedSequence(seed)
    buckets, min_step, max_step = {}, {}, {}
    for entry, child in zip(catalogue, root.spawn(len(catalogue)), strict=True):
        found = metric_buckets(np.asarray(series[entry["key"]], dtype=float), child)
        buckets[entry["key"]] = found["buckets"]
        min_step[entry["key"]] = found["min_step"]
        max_step[entry["key"]] = found["max_step"]

    n_files = math.ceil(n_plans / range_size)
    for k in range(n_files):
        _write_json(
            out / "steps" / f"{k}.json",
            range_file(assignments, series, k * range_size, range_size),
        )
    _write_json(out / "nodes.json", node_ids.tolist())
    _write_json(
        out / "index.json",
        {
            "module": manifest["module_slug"],
            "preset": preset_key,
            "label": manifest["label"],
            "weights": manifest["region_weights"],
            "n_plans": n_plans,
            "n_districts": scores["num_dists"],
            "n_nodes": int(len(node_ids)),
            "range_size": range_size,
            "cut_edges_unit_type": cut_edges_unit,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "metrics": catalogue,
            "buckets": buckets,
            "min_step": min_step,
            "max_step": max_step,
        },
    )
    return out


def load_scores_for(ensemble_dir: Path, preset_key: str) -> dict:
    return package.load_scores(ensemble_dir / f"{preset_key}.scores.npz")


def write_index(diag_dir: str | Path, module_slug: str) -> dict:
    """Write ``index.json`` listing every preset folder in ``diag_dir`` (in
    ``PRESETS`` order) and seed ``registry.json`` when absent."""
    diag_dir = Path(diag_dir)
    found = {
        p.parent.name: json.loads(p.read_text()) for p in diag_dir.glob("*/index.json")
    }
    order = [k for k in PRESETS if k in found] + sorted(set(found) - set(PRESETS))
    index = {
        "module_slug": module_slug,
        "presets": [
            {
                "key": key,
                "label": found[key]["label"],
                "default": False,
                "n_plans": found[key]["n_plans"],
                "generated_at": found[key]["generated_at"],
            }
            for key in order
        ],
    }
    _write_json(diag_dir / "index.json", index)
    registry = diag_dir / REGISTRY_FILENAME
    if not registry.exists():
        registry.write_text("[]")
    return index


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, separators=(",", ":")))
