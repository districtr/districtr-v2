"""Short-burst optimization (Cannon et al. 2023) over rustrecom chains.

A run climbs one objective from a seed plan. Each burst runs the preset's chain
for ``burst_length`` accepted steps from the run's current plan and scores every
plan it visits; the run then moves to the best plan seen so far, the latest of
equals when several tie. A run ends after ``bursts`` bursts, or earlier once
``plateau`` consecutive bursts bring no strict improvement. Restarts repeat the
run from different plans of the preset's sampling chain.

Objectives read partisan tallies, county splits, cut edges and compactness only;
no objective or constraint reads a demographic column.

Output per preset and objective, in ``<ensemble dir>/optimize/<preset>/``:

- ``<objective>.npz`` — every visited plan, one row each, restarts in order:
  ``assignments`` (rows x nodes, 0-based district index, the chain's
  ``node_ids`` order), ``restart``, ``burst`` (0 for a restart's seed plan,
  bursts count from 1), ``parent`` (row of the plan this one was proposed from,
  -1 for a seed), ``value`` (the objective), ``cut_edges``, and every array
  ``score.evaluate`` produces, under the names of ``<preset>.scores.npz``.
- ``<objective>.json`` — the run's parameters, its distinct best rows and, per
  restart, the seed plan, best value and row, bursts run, stop reason and wall
  time.
"""

import importlib.metadata
import json
import logging
import platform
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np
from scipy.optimize import linear_sum_assignment

from ensembles import chain
from ensembles.graph import SEED_COL
from ensembles.presets import Preset
from ensembles.score import COMPETITIVE_MARGIN

logger = logging.getLogger(__name__)

OPTIMIZE_DIRNAME = "optimize"
BURST_LENGTH = 10
BURSTS = 500
PLATEAU = 150
SEED_PLANS = (0, 33_333, 66_666)
RNG_SEED = 20261027
DISTINCT_PLANS = 5
MIN_UNIT_DIFFERENCE = 0.10
LOG_EVERY = 50


# ── Objectives ────────────────────────────────────────────────────────────────


def partisan_composite(arrays: dict, elections: list[str], party: str) -> np.ndarray:
    """The party's seats summed over ``elections``, plus the mean over those
    elections of the party's two-party vote share in its closest losing
    district: the largest share among districts it does not strictly win, or
    0.5 in an election it sweeps. The fraction lies in [0, 0.5], so a seat
    always outweighs it, and it rises as a lost district nears a win."""
    seats_key = {"dem": "seats", "rep": "rep_seats"}[party]
    n = len(arrays[f"{seats_key}__{elections[0]}"])
    seats = np.zeros(n)
    closest = np.zeros(n)
    for e in elections:
        seats += arrays[f"{seats_key}__{e}"]
        shares = arrays[f"district_vote_shares__{e}"]
        if party == "rep":
            shares = 1.0 - shares
        losing = np.where(shares <= 0.5, shares, -np.inf)  # NaN compares False
        best = losing.max(axis=1)
        closest += np.where(np.isfinite(best), best, 0.5)
    return seats + closest / len(elections)


def competitive_contests(arrays: dict, elections: list[str]) -> np.ndarray:
    """(district, election) contests whose Democratic two-party share lies in the
    open interval 0.5 +/- ``COMPETITIVE_MARGIN``, summed over ``elections``; the
    definition of gerrytools' ``CompetitiveContests``."""
    total = 0
    for e in elections:
        shares = arrays[f"district_vote_shares__{e}"]
        total = total + (np.abs(shares - 0.5) < COMPETITIVE_MARGIN).sum(axis=1)
    return np.asarray(total, dtype=np.int64)


@dataclass(frozen=True)
class Objective:
    key: str
    label: str
    direction: str  # "max" or "min"
    definition: str
    value: Callable[[dict, list[str]], np.ndarray]

    def oriented(self, values: np.ndarray) -> np.ndarray:
        """``values`` with larger always better."""
        values = np.asarray(values, dtype=float)
        return values if self.direction == "max" else -values


OBJECTIVES: dict[str, Objective] = {
    o.key: o
    for o in (
        Objective(
            "dem_seats",
            "Most Democratic seats",
            "max",
            "Democratic seats summed over the tallied elections, plus the mean over "
            "those elections of the Democratic two-party vote share in the closest "
            "district the Democrat loses (0.5 in an election the Democrat sweeps).",
            lambda a, e: partisan_composite(a, e, "dem"),
        ),
        Objective(
            "rep_seats",
            "Most Republican seats",
            "max",
            "Republican seats summed over the tallied elections, plus the mean over "
            "those elections of the Republican two-party vote share in the closest "
            "district the Republican loses (0.5 in an election the Republican "
            "sweeps).",
            lambda a, e: partisan_composite(a, e, "rep"),
        ),
        Objective(
            "competitive",
            "Most competitive contests",
            "max",
            "Contests, one per district and tallied election, with a Democratic "
            f"two-party share strictly within {COMPETITIVE_MARGIN:.0%} of 50%, "
            "summed over the tallied elections.",
            competitive_contests,
        ),
        Objective(
            "county_splits",
            "Fewest county splits",
            "min",
            "Counties assigned to more than one district.",
            lambda a, e: np.asarray(a["county_splits"]),
        ),
        Objective(
            "cut_edges",
            "Fewest cut edges",
            "min",
            "Adjacent pairs of units in different districts; blocks for a module "
            "whose VTDs can be shattered, VTDs otherwise.",
            lambda a, e: np.asarray(a["cut_edges"]),
        ),
        Objective(
            "polsby_popper",
            "Highest mean Polsby-Popper",
            "max",
            "Mean over districts of 4 * pi * area / perimeter^2, measured in the "
            "state's UTM zone.",
            lambda a, e: np.asarray(a["polsby_popper_mean"]),
        ),
    )
}


# ── Distinct plans ────────────────────────────────────────────────────────────


def unit_difference(a: np.ndarray, b: np.ndarray, num_dists: int) -> float:
    """Share of units in different districts under the district matching between
    the two plans that keeps the most units together, so relabelled districts
    count as the same."""
    overlap = np.zeros((num_dists, num_dists), dtype=np.int64)
    np.add.at(overlap, (a, b), 1)
    rows, cols = linear_sum_assignment(overlap, maximize=True)
    return 1.0 - overlap[rows, cols].sum() / len(a)


def distinct_best(
    assignments: np.ndarray,
    oriented: np.ndarray,
    num_dists: int,
    n: int = DISTINCT_PLANS,
    min_difference: float = MIN_UNIT_DIFFERENCE,
) -> list[int]:
    """Rows of up to ``n`` plans, best first, each differing from every row kept
    before it in at least ``min_difference`` of units; ties keep the earlier
    row."""
    kept: list[int] = []
    for row in np.argsort(-oriented, kind="stable"):
        if all(
            unit_difference(assignments[row], assignments[k], num_dists)
            >= min_difference
            for k in kept
        ):
            kept.append(int(row))
            if len(kept) == n:
                break
    return kept


def lineage(parent: np.ndarray, row: int) -> list[int]:
    """Rows from the restart's seed to ``row``, following ``parent``: the
    consecutive chain steps by which the run reached that plan."""
    path = [row]
    while parent[path[-1]] >= 0:
        path.append(int(parent[path[-1]]))
    return path[::-1]


# ── Bursts ────────────────────────────────────────────────────────────────────


class BurstRunner:
    """Runs short rustrecom chains from arbitrary seed plans. The seed is written
    as the assignment column of a private copy of the chain's input graph."""

    def __init__(self, graph_json: Path, preset: Preset, tol: float, work_dir: Path):
        self.graph = json.loads(Path(graph_json).read_text())
        self.node_ids = np.array([node["id"] for node in self.graph["nodes"]])
        self.preset, self.tol = preset, tol
        self.work_dir = work_dir
        work_dir.mkdir(parents=True, exist_ok=True)
        self.graph_path = work_dir / "graph.json"
        self.output = work_dir / "burst.jsonl"

    def run(self, seed: np.ndarray, n_steps: int, rng_seed: int) -> np.ndarray:
        """``n_steps`` consecutive accepted plans after ``seed`` (rows x nodes)."""
        for node, district in zip(self.graph["nodes"], seed.tolist(), strict=True):
            node[SEED_COL] = district
        self.graph_path.write_text(json.dumps(self.graph, separators=(",", ":")))
        config = chain.chain_config(
            self.graph_path,
            self.preset,
            n_steps + 1,  # rustrecom counts the seed as a step
            rng_seed,
            self.tol,
            [],
            self.output,
        )
        if self.output.exists():
            self.output.unlink()
        subprocess.run(
            [chain.rustrecom_bin(), "chain", "--config", json.dumps(config)],
            check=True,
            stderr=subprocess.DEVNULL,
        )
        plans = np.empty((n_steps, len(seed)), dtype=np.uint8)
        current = seed.astype(np.uint8)
        i = 0
        with open(self.output) as f:
            for line in f:
                if not line.startswith('{"step"'):
                    continue
                step = json.loads(line)["step"]
                a, b = step["dists"]
                current = current.copy()
                current[step["nodes"][0]] = a
                current[step["nodes"][1]] = b
                plans[i] = current
                i += 1
        if i != n_steps:
            raise ValueError(f"Expected {n_steps} burst steps, read {i}")
        return plans

    def close(self) -> None:
        shutil.rmtree(self.work_dir, ignore_errors=True)


@dataclass
class Scorer:
    """Scores plans with gerrytools and a cut-edge counter, and evaluates the
    objectives on the result."""

    evaluator: object
    elections: list[str]
    cut_edges: Callable[[np.ndarray], np.ndarray]

    def score(self, assignments: np.ndarray) -> dict:
        from ensembles import score  # gerrytools is installed only in this venv

        arrays = score.evaluate(self.evaluator, assignments)
        arrays["cut_edges"] = self.cut_edges(assignments)
        return arrays


def run_restart(
    objective: Objective,
    runner: BurstRunner,
    scorer: Scorer,
    seed: np.ndarray,
    rng: np.random.Generator,
    burst_length: int = BURST_LENGTH,
    bursts: int = BURSTS,
    plateau: int = PLATEAU,
    label: str = "",
) -> dict:
    """One short-burst run from ``seed``; returns its visited rows (the arrays of
    ``<objective>.npz`` except ``restart``, rows local to this run) and its
    facts."""
    started = time.monotonic()
    seed = seed.astype(np.uint8)[None, :]
    first = scorer.score(seed)
    batches = [
        {
            **first,
            "assignments": seed,
            "burst": np.array([0]),
            "parent": np.array([-1]),
            "value": objective.value(first, scorer.elections),
        }
    ]
    n_rows = 1
    current = 0
    best = objective.oriented(batches[0]["value"])[0]
    since_improvement = 0
    stopped = "budget"
    burst = 0
    for burst in range(1, bursts + 1):
        plans = runner.run(
            batches_row(batches, current), burst_length, int(rng.integers(1, 2**63))
        )
        arrays = scorer.score(plans)
        values = objective.value(arrays, scorer.elections)
        parent = np.arange(n_rows - 1, n_rows - 1 + burst_length)
        parent[0] = current
        batches.append(
            {
                **arrays,
                "assignments": plans,
                "burst": np.full(burst_length, burst),
                "parent": parent,
                "value": values,
            }
        )
        oriented = objective.oriented(values)
        top = oriented.max()
        if top > best:
            since_improvement = 0
        else:
            since_improvement += 1
        if top >= best:
            best = top
            current = n_rows + int(np.flatnonzero(oriented == top)[-1])
        n_rows += burst_length
        if burst % LOG_EVERY == 0:
            logger.info(
                "%s burst %d: best %s, %d bursts since improvement, %.0fs",
                label,
                burst,
                _display(objective, best),
                since_improvement,
                time.monotonic() - started,
            )
        if since_improvement >= plateau:
            stopped = "plateau"
            break

    rows = {k: np.concatenate([b[k] for b in batches]) for k in batches[0]}
    best_row = int(np.argmax(objective.oriented(rows["value"])))
    return {
        "rows": rows,
        "facts": {
            "best_value": float(rows["value"][best_row]),
            "best_row": best_row,
            "bursts_run": burst,
            "stopped": stopped,
            "n_visited": int(n_rows),
            "wall_time_seconds": round(time.monotonic() - started, 1),
        },
    }


def batches_row(batches: list[dict], row: int) -> np.ndarray:
    for batch in batches:
        n = len(batch["assignments"])
        if row < n:
            return batch["assignments"][row]
        row -= n
    raise IndexError(row)


def _display(objective: Objective, oriented: float) -> float:
    return oriented if objective.direction == "max" else -oriented


def optimize(
    objective: Objective,
    runner: BurstRunner,
    scorer: Scorer,
    chain_assignments: np.ndarray,
    seeds: tuple[int, ...] = SEED_PLANS,
    burst_length: int = BURST_LENGTH,
    bursts: int = BURSTS,
    plateau: int = PLATEAU,
    rng_seed: int = RNG_SEED,
    label: str = "",
) -> dict:
    """Every restart of ``objective``, one per seed plan of ``chain_assignments``;
    returns ``{"rows", "restarts": [facts], "distinct": [rows]}`` with rows
    concatenated across restarts (``parent`` and best rows renumbered)."""
    parts, restarts = [], []
    offset = 0
    for r, seed_plan in enumerate(seeds):
        rng = np.random.default_rng([rng_seed, r])
        result = run_restart(
            objective,
            runner,
            scorer,
            chain_assignments[seed_plan],
            rng,
            burst_length,
            bursts,
            plateau,
            label=f"{label} restart {r}",
        )
        rows = result["rows"]
        rows["parent"] = np.where(rows["parent"] >= 0, rows["parent"] + offset, -1)
        rows["restart"] = np.full(len(rows["value"]), r)
        facts = {**result["facts"], "seed_plan": int(seed_plan)}
        facts["best_row"] += offset
        logger.info(
            "%s restart %d: best %s after %d bursts (%s), %.0fs",
            label,
            r,
            facts["best_value"],
            facts["bursts_run"],
            facts["stopped"],
            facts["wall_time_seconds"],
        )
        offset += len(rows["value"])
        parts.append(rows)
        restarts.append(facts)
    rows = {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}
    num_dists = int(rows["assignments"].max()) + 1
    distinct = distinct_best(
        rows["assignments"], objective.oriented(rows["value"]), num_dists
    )
    return {"rows": rows, "restarts": restarts, "distinct": distinct}


# ── Files ─────────────────────────────────────────────────────────────────────


def run_paths(ensemble_dir: Path, preset_key: str, objective_key: str) -> tuple:
    folder = Path(ensemble_dir) / OPTIMIZE_DIRNAME / preset_key
    return folder / f"{objective_key}.npz", folder / f"{objective_key}.json"


def write_run(
    ensemble_dir: Path,
    preset_key: str,
    objective: Objective,
    result: dict,
    params: dict,
) -> Path:
    npz_path, json_path = run_paths(ensemble_dir, preset_key, objective.key)
    npz_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(npz_path, **result["rows"])
    facts = {
        "objective": objective.key,
        "label": objective.label,
        "direction": objective.direction,
        "definition": objective.definition,
        "method": "short_bursts",
        **params,
        "distinct": {
            "n": DISTINCT_PLANS,
            "min_unit_difference": MIN_UNIT_DIFFERENCE,
            "rows": result["distinct"],
        },
        "restarts": result["restarts"],
        "software": software_versions(),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    json_path.write_text(json.dumps(facts, indent=1))
    return npz_path


def load_run(ensemble_dir: Path, preset_key: str, objective_key: str) -> dict | None:
    """A written run as ``{"facts", "rows"}``, or ``None`` when it was not run."""
    npz_path, json_path = run_paths(ensemble_dir, preset_key, objective_key)
    if not npz_path.exists():
        return None
    data = np.load(npz_path)
    return {
        "facts": json.loads(json_path.read_text()),
        "rows": {k: data[k] for k in data.files},
    }


def software_versions() -> dict:
    versions = {"python": platform.python_version()}
    for package in ("numpy", "gerrytools"):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            pass
    try:
        out = subprocess.run(
            [chain.rustrecom_bin(), "--version"],
            capture_output=True,
            text=True,
            check=True,
        )
        versions["rustrecom"] = out.stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    return versions
