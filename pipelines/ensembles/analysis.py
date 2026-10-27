"""Analysis files of a preset's package, written beside ``package.py``'s files.

Layout under ``<ensemble dir>/package/<preset>/``:

- ``bounds.json`` — per optimized objective: the best value found, the best
  value of every restart, the run parameters, and up to five distinct plans
  with their metrics.
- ``extremes/<objective>/<k>.json`` and ``.svg`` — those plans, ``k`` = 0 for
  the best: assignment, value and metrics, and a thumbnail.
- ``joint/index.json`` and ``joint/<id>.json`` — two-way bucket counts of the
  sample for each selected pair of series.
- ``chunks/<k>.json`` — the sampled plans in shuffled order, ``CHUNK_SIZE``
  per chunk, each with its assignment and metrics.
- ``trajectory/<objective>.json`` and ``trajectory/<objective>/<i>.svg`` —
  ``TRAJECTORY_STEPS`` steps of the chain path by which the best restart
  reached its best plan.
- ``config.json`` — chain, scoring and optimization configuration, seeds,
  software versions, the ``node_ids`` order of every assignment, and the
  ``analysis`` flags ``write_index`` copies into ``index.json``.

A series reference is ``{"metric", "election", "stat"}``, the nesting of
``summary.json``: ``election`` names the election of a per-election series,
``stat`` the aggregate of a compactness series, each ``None`` otherwise. A
metrics payload is a segment step (``package.segment_step``) without its
``plan`` field. Assignments list 1-based district numbers, the app's zone
numbers, in ``node_ids`` order.
"""

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shapely

from ensembles import optimize, package
from ensembles.package import PACKAGE_DIRNAME, PACKAGE_VERSION, _round, _write_json

logger = logging.getLogger(__name__)

JOINT_BUCKETS = 50
CHUNK_SIZE = 100
SHUFFLE_SEED = 20261027
TRAJECTORY_STEPS = 200
ANALYSIS_DIRS = ("extremes", "joint", "chunks", "trajectory")


def ref(metric: str, election: str | None = None, stat: str | None = None) -> dict:
    return {"metric": metric, "election": election, "stat": stat}


# Pairs drawn as density maps, with the reason each is informative. Selected
# for Colorado's geography and constitution; a pair whose series a module
# lacks is skipped.
JOINT_PAIRS = (
    (
        ref("disproportionality", "pres_24"),
        ref("county_splits"),
        "Democratic voters concentrate in the Denver metro, so plans whose seat "
        "share tracks the statewide vote may have to divide it.",
    ),
    (
        ref("n_competitive_contests"),
        ref("disproportionality", "pres_24"),
        "Colorado's constitution ranks competitiveness after its other criteria, "
        "and in a state that votes about 55 to 45 competitive districts and "
        "proportional seats pull apart.",
    ),
    (
        ref("cut_edges"),
        ref("county_splits"),
        "A control pair: compact plans and whole counties are expected to go "
        "together, which calibrates the reading of the other pairs.",
    ),
    (
        ref("seats", "pres_24"),
        ref("cut_edges"),
        "What a partisan advantage costs in shape, for either party: Republican "
        "seats are the remaining districts.",
    ),
)


def series_id(series: dict) -> str:
    return "_".join(
        part for part in (series["metric"], series["election"], series["stat"]) if part
    )


def series_values(series: dict, arrays: dict, cut_edges: np.ndarray) -> np.ndarray:
    """The per-plan array behind a series reference."""
    metric, election, stat = series["metric"], series["election"], series["stat"]
    if metric == "cut_edges":
        return np.asarray(cut_edges)
    if election:
        return arrays[f"{metric}__{election}"]
    if stat:
        return arrays[f"{metric}_{stat}"]
    return arrays[metric]


def has_series(series: dict, arrays: dict) -> bool:
    if series["metric"] == "cut_edges":
        return True
    try:
        series_values(series, arrays, np.empty(0))
    except KeyError:
        return False
    return True


def metrics_payload(
    scores: dict, cut_edges: np.ndarray, row: int, cut_edges_unit: str
) -> dict:
    step = package.segment_step(scores, cut_edges, row, cut_edges_unit)
    del step["plan"]
    return step


def zone_numbers(assignment: np.ndarray) -> list[int]:
    return (assignment.astype(np.int64) + 1).tolist()


# ── Joint distributions ───────────────────────────────────────────────────────


def joint_axis(values: np.ndarray) -> tuple[str, list, np.ndarray]:
    """``(kind, edges, bucket of every value)`` for one axis of a joint count.

    Kinds and edges are ``package.distribution``'s, except that continuous
    series, and integer series spanning more than ``JOINT_BUCKETS`` values, get
    ``JOINT_BUCKETS`` equal-width ``continuous`` buckets over min..max, each
    half-open except the last, which includes max. ``values`` must be finite."""
    dist = package.distribution(values)
    kind = dist["kind"]
    if kind == "integer" and len(dist["counts"]) > JOINT_BUCKETS:
        kind = "continuous"
    if kind == "integer":
        return kind, dist["edges"], (values - dist["edges"][0]).astype(np.int64)
    if kind == "discrete":
        return kind, dist["edges"], np.searchsorted(np.unique(values), values)
    lo, hi = float(values.min()), float(values.max())
    if lo == hi:
        return kind, package._rounded([lo, hi]), np.zeros(len(values), dtype=np.int64)
    edges = np.linspace(lo, hi, JOINT_BUCKETS + 1)
    index = np.searchsorted(edges, values, side="right") - 1
    return kind, package._rounded(edges), np.clip(index, 0, JOINT_BUCKETS - 1)


def n_buckets(kind: str, edges: list) -> int:
    return len(edges) if kind == "discrete" else len(edges) - 1


def joint(x: dict, y: dict, arrays: dict, cut_edges: np.ndarray) -> dict:
    """``joint/<id>.json``: ``counts[i][j]`` plans in y bucket ``i`` and x bucket
    ``j``, over the plans where both series are finite (``n``)."""
    xv = np.asarray(series_values(x, arrays, cut_edges))
    yv = np.asarray(series_values(y, arrays, cut_edges))
    finite = np.ones(len(xv), dtype=bool)
    for v in (xv, yv):
        if v.dtype.kind == "f":
            finite &= np.isfinite(v)
    x_kind, x_edges, xi = joint_axis(xv[finite])
    y_kind, y_edges, yi = joint_axis(yv[finite])
    counts = np.zeros(
        (n_buckets(y_kind, y_edges), n_buckets(x_kind, x_edges)), dtype=np.int64
    )
    np.add.at(counts, (yi, xi), 1)
    return {
        "x": x,
        "y": y,
        "x_kind": x_kind,
        "x_edges": x_edges,
        "y_kind": y_kind,
        "y_edges": y_edges,
        "counts": counts.tolist(),
        "n": int(finite.sum()),
    }


def write_joint(out: Path, arrays: dict, cut_edges: np.ndarray) -> list[str]:
    (out / "joint").mkdir(parents=True, exist_ok=True)
    pairs = []
    for x, y, why in JOINT_PAIRS:
        if not (has_series(x, arrays) and has_series(y, arrays)):
            logger.warning("Skipping joint %s x %s: series missing", x, y)
            continue
        pair_id = f"{series_id(x)}__{series_id(y)}"
        _write_json(out / "joint" / f"{pair_id}.json", joint(x, y, arrays, cut_edges))
        pairs.append(
            {"id": pair_id, "x": x, "y": y, "file": f"joint/{pair_id}.json", "why": why}
        )
    _write_json(out / "joint" / "index.json", {"pairs": pairs}, indent=1)
    return [p["id"] for p in pairs]


# ── Chunks ────────────────────────────────────────────────────────────────────


def chunk_order(n_plans: int, shuffle_seed: int) -> np.ndarray:
    """The chain's plan indices in shuffled order; chunk ``k`` holds positions
    ``k * CHUNK_SIZE`` up to ``(k + 1) * CHUNK_SIZE``."""
    return np.random.default_rng(shuffle_seed).permutation(n_plans)


def write_chunks(
    out: Path,
    assignments: np.ndarray,
    scores: dict,
    cut_edges: np.ndarray,
    cut_edges_unit: str,
    shuffle_seed: int,
) -> int:
    (out / "chunks").mkdir(parents=True, exist_ok=True)
    order = chunk_order(scores["n_plans"], shuffle_seed)
    n_chunks = 0
    for k, start in enumerate(range(0, len(order), CHUNK_SIZE)):
        plans = [
            {
                "plan": int(plan),
                "assignment": zone_numbers(assignments[plan]),
                "metrics": metrics_payload(scores, cut_edges, plan, cut_edges_unit),
            }
            for plan in order[start : start + CHUNK_SIZE]
        ]
        _write_json(out / "chunks" / f"{k}.json", {"chunk": k, "plans": plans})
        n_chunks = k + 1
        if n_chunks % 100 == 0:
            logger.info("Wrote %d chunks", n_chunks)
    return n_chunks


# ── Optimization results ──────────────────────────────────────────────────────


def _run_scores(run: dict, num_dists: int) -> dict:
    rows = run["rows"]
    return {
        "arrays": rows,
        "elections": run["facts"]["elections"],
        "n_plans": len(rows["value"]),
        "num_dists": num_dists,
    }


class Thumbnails:
    def __init__(self, coverage: np.ndarray, num_dists: int):
        self.dissolver = package.DistrictDissolver(coverage)
        self.bounds = tuple(shapely.total_bounds(coverage))
        self.num_dists = num_dists

    def write(self, path: Path, assignment: np.ndarray) -> None:
        districts = self.dissolver.districts(assignment, self.num_dists)
        path.write_text(package.thumbnail_svg(districts, self.bounds))


def bounds_entry(objective: optimize.Objective, run: dict, plans: list[dict]) -> dict:
    facts = run["facts"]
    return {
        "key": objective.key,
        "label": objective.label,
        "direction": objective.direction,
        "objective": objective.definition,
        "best_value": plans[0]["value"],
        "restarts": [_round(r["best_value"]) for r in facts["restarts"]],
        "run": {
            "method": facts["method"],
            "burst_length": facts["burst_length"],
            "bursts": facts["bursts"],
            "plateau": facts["plateau"],
            "restarts": len(facts["restarts"]),
            "seeds": facts["seeds"],
        },
        "plans": plans,
    }


def write_bounds(out: Path, runs: dict, num_dists: int, thumbs: Thumbnails) -> None:
    objectives = []
    for key, run in runs.items():
        objective = optimize.OBJECTIVES[key]
        rows, scores = run["rows"], _run_scores(run, num_dists)
        unit = run["facts"]["cut_edges_unit_type"]
        folder = out / "extremes" / key
        folder.mkdir(parents=True, exist_ok=True)
        plans = []
        for k, row in enumerate(run["facts"]["distinct"]["rows"]):
            value = _round(rows["value"][row])
            metrics = metrics_payload(scores, rows["cut_edges"], row, unit)
            _write_json(
                folder / f"{k}.json",
                {
                    "objective": key,
                    "rank": k + 1,
                    "value": value,
                    "assignment": zone_numbers(rows["assignments"][row]),
                    "metrics": metrics,
                },
            )
            thumbs.write(folder / f"{k}.svg", rows["assignments"][row])
            plans.append(
                {
                    "file": f"extremes/{key}/{k}.json",
                    "thumb": f"extremes/{key}/{k}.svg",
                    "value": value,
                    "metrics": metrics,
                }
            )
        objectives.append(bounds_entry(objective, run, plans))
    _write_json(out / "bounds.json", {"objectives": objectives})


def best_restart(objective: optimize.Objective, facts: dict) -> int:
    """Index of the restart with the best value; the first on ties."""
    values = [r["best_value"] for r in facts["restarts"]]
    return int(np.argmax(objective.oriented(np.array(values))))


def subsample(n: int, k: int | None = None) -> np.ndarray:
    """Up to ``k`` (default ``TRAJECTORY_STEPS``) evenly spaced positions of
    ``0..n-1``, first and last included."""
    k = TRAJECTORY_STEPS if k is None else k
    return np.unique(np.linspace(0, n - 1, min(n, k)).round().astype(int))


def trajectory(objective: optimize.Objective, run: dict, num_dists: int) -> dict:
    """``trajectory/<objective>.json`` without thumbnails written: the chain path
    from the best restart's seed to its best plan, subsampled."""
    rows, facts = run["rows"], run["facts"]
    restart = best_restart(objective, facts)
    path = optimize.lineage(rows["parent"], facts["restarts"][restart]["best_row"])
    scores = _run_scores(run, num_dists)
    unit = facts["cut_edges_unit_type"]
    steps = []
    for i, position in enumerate(subsample(len(path))):
        row = path[position]
        steps.append(
            {
                "burst": int(rows["burst"][row]),
                "value": _round(rows["value"][row]),
                "metrics": metrics_payload(scores, rows["cut_edges"], row, unit),
                "thumb": f"trajectory/{objective.key}/{i}.svg",
                "row": row,
            }
        )
    return {
        "objective": objective.key,
        "seed_plan": facts["restarts"][restart]["seed_plan"],
        "path_length": len(path),
        "steps": steps,
    }


def write_trajectories(
    out: Path, runs: dict, num_dists: int, thumbs: Thumbnails
) -> None:
    for key, run in runs.items():
        objective = optimize.OBJECTIVES[key]
        result = trajectory(objective, run, num_dists)
        (out / "trajectory" / key).mkdir(parents=True, exist_ok=True)
        for step in result["steps"]:
            row = step.pop("row")
            thumbs.write(out / step["thumb"], run["rows"]["assignments"][row])
        _write_json(out / "trajectory" / f"{key}.json", result)


# ── Preset ────────────────────────────────────────────────────────────────────


def _optimization_config(runs: dict) -> dict:
    keep = (
        "label",
        "direction",
        "definition",
        "method",
        "variant",
        "region_weights",
        "tol",
        "burst_length",
        "bursts",
        "plateau",
        "seeds",
        "rng_seed",
        "elections",
        "cut_edges_unit_type",
        "distinct",
        "restarts",
        "wall_time_seconds",
        "software",
        "created_at",
    )
    return {
        key: {k: run["facts"][k] for k in keep if k in run["facts"]}
        for key, run in runs.items()
    }


def write_analysis(
    ensemble_dir: str | Path,
    preset_key: str,
    vtd_gpkg: str | Path,
    graph_npz: str | Path | None = None,
    shuffle_seed: int = SHUFFLE_SEED,
) -> Path:
    """Write every analysis file of ``package/<preset>/`` from the preset's chain
    npz, its scores and whatever ``optimize/<preset>/`` runs exist; returns the
    preset folder. Earlier analysis files of the preset are replaced."""
    ensemble_dir = Path(ensemble_dir)
    out = ensemble_dir / PACKAGE_DIRNAME / preset_key
    out.mkdir(parents=True, exist_ok=True)
    for name in ANALYSIS_DIRS:
        shutil.rmtree(out / name, ignore_errors=True)
    (out / "bounds.json").unlink(missing_ok=True)

    chain_npz = np.load(ensemble_dir / f"{preset_key}.npz")
    node_ids, assignments = chain_npz["node_ids"], chain_npz["assignments"]
    scores = package.load_scores(ensemble_dir / f"{preset_key}.scores.npz")
    if graph_npz is not None:
        cut_edges = package.CutEdgeCounter.blocks(node_ids, graph_npz)(assignments)
        unit = "block"
    else:
        cut_edges, unit = chain_npz["cut_edges"], "vtd"
    num_dists = scores["num_dists"]

    runs = {}
    for key in optimize.OBJECTIVES:
        run = optimize.load_run(ensemble_dir, preset_key, key)
        if run is None:
            continue
        if run["facts"]["cut_edges_unit_type"] != unit:
            raise ValueError(
                f"{preset_key} {key} counted {run['facts']['cut_edges_unit_type']} "
                f"cut edges, the package counts {unit}"
            )
        runs[key] = run

    pair_ids = write_joint(out, scores["arrays"], cut_edges)
    logger.info("%s: joint counts for %d pairs", preset_key, len(pair_ids))
    n_chunks = write_chunks(out, assignments, scores, cut_edges, unit, shuffle_seed)
    logger.info("%s: %d chunks", preset_key, n_chunks)
    if runs:
        thumbs = Thumbnails(package.load_coverage(vtd_gpkg, node_ids), num_dists)
        write_bounds(out, runs, num_dists, thumbs)
        write_trajectories(out, runs, num_dists, thumbs)
        logger.info("%s: bounds and trajectories for %s", preset_key, sorted(runs))

    analysis = {
        "bounds": bool(runs),
        "joint": bool(pair_ids),
        "chunks": n_chunks,
        "trajectory": bool(runs),
    }
    chain_manifest = json.loads((ensemble_dir / f"{preset_key}.json").read_text())
    score_manifest = json.loads(
        (ensemble_dir / f"{preset_key}.scores.json").read_text()
    )
    _write_json(
        out / "config.json",
        {
            "package_version": PACKAGE_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "analysis": analysis,
            "chain": package._public_manifest(chain_manifest, ("graph_json",)),
            "scoring": package._public_manifest(
                score_manifest, ("source_npz", "vtd_gpkg")
            ),
            "cut_edges_unit_type": unit,
            "optimization": _optimization_config(runs),
            "joint": {"buckets": JOINT_BUCKETS, "pairs": pair_ids},
            "chunks": {
                "n_chunks": n_chunks,
                "chunk_size": CHUNK_SIZE,
                "shuffle_seed": shuffle_seed,
                "order": "numpy.random.default_rng(shuffle_seed).permutation(n_plans)",
            },
            "trajectory": {
                "steps": TRAJECTORY_STEPS,
                "path": "chain steps from the best restart's seed to its best plan, "
                "evenly subsampled with both ends kept",
            },
            "software": optimize.software_versions(),
            "node_ids": node_ids.tolist(),
        },
        indent=1,
    )
    return out
