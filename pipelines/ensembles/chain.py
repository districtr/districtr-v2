"""Run a rustrecom chain and pack its output into one npz per preset.

rustrecom (https://github.com/mggg/frcw.rs) is driven through its JSON config
file, which it echoes back verbatim in the output's ``meta`` record. The
``jsonl-full`` writer emits the seed's district tallies once, then one record
per accepted step holding the two recombined districts, their new node lists
and tallies. Assignments and tallies for every plan are rebuilt from those
deltas and verified against a direct recomputation.
"""

import json
import logging
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from networkx.readwrite import json_graph

from ensembles.graph import COUNTY_COL, POP_COL, SEED_COL, election_columns
from ensembles.presets import Preset

logger = logging.getLogger(__name__)

RUSTRECOM_BIN_ENV = "RUSTRECOM_BIN"


def rustrecom_bin() -> str:
    path = os.environ.get(RUSTRECOM_BIN_ENV) or shutil.which("rustrecom")
    if not path:
        raise FileNotFoundError(
            f"rustrecom not found: set {RUSTRECOM_BIN_ENV} or put it on PATH"
        )
    return path


def chain_config(
    graph_json: Path,
    preset: Preset,
    n_steps: int,
    rng_seed: int,
    tol: float,
    sum_cols: list[str],
    output_file: Path,
) -> dict:
    config = {
        "version": 1,
        "command": "chain",
        "graph_json": str(graph_json),
        "n_steps": n_steps,
        "tol": tol,
        "pop_col": POP_COL,
        "assignment_col": SEED_COL,
        "rng_seed": rng_seed,
        "variant": preset.variant,
        "writer": "jsonl-full",
        "cut_edges_count": True,
        "sum_cols": sum_cols,
        "output_file": str(output_file),
    }
    if preset.region_weights:
        config["region_weights"] = preset.region_weights
    return config


def run_chain(config: dict, config_path: Path) -> None:
    config_path.write_text(json.dumps(config, indent=1))
    output = Path(config["output_file"])
    if output.exists():
        output.unlink()
    subprocess.run([rustrecom_bin(), "chain", "--config", str(config_path)], check=True)


def pack(graph_json: Path, jsonl_path: Path, out_npz: Path) -> dict:
    """Rebuild every plan from the chain deltas and save them; returns run facts
    for the manifest."""
    graph = json_graph.adjacency_graph(json.load(open(graph_json)))
    nodes = list(graph.nodes)  # rustrecom's node index is the JSON node order
    first = graph.nodes[nodes[0]]
    tally_cols = [POP_COL, *election_columns(first)]
    tallies = {
        c: np.array([graph.nodes[n][c] for n in nodes], dtype=np.int64)
        for c in tally_cols
    }
    seed = np.array([graph.nodes[n][SEED_COL] for n in nodes])

    meta = init = None
    with open(jsonl_path) as f:
        for line in f:
            record = json.loads(line)
            if "meta" in record:
                meta = record["meta"]
            elif "init" in record:
                init = record["init"]
                break
    if meta is None or init is None:
        raise ValueError("Chain output lacks meta or init record")
    n_plans = json.loads(meta["config"])[
        "n_steps"
    ]  # the seed plus n_steps - 1 accepted steps
    num_dists = init["num_dists"]

    assignments = np.empty((n_plans, len(nodes)), dtype=np.uint8)
    populations = np.empty((n_plans, num_dists), dtype=np.int64)
    # rustrecom also tallies the region column of region-aware runs; keep only
    # the integer tally columns.
    sum_cols = [c for c in init["sums"] if c in tallies and c != POP_COL]
    sums = {c: np.empty((n_plans, num_dists), dtype=np.int64) for c in sum_cols}
    cut_edges = np.empty(n_plans, dtype=np.int32)
    assignments[0] = seed - seed.min()
    populations[0] = init["populations"]
    for col in sum_cols:
        sums[col][0] = init["sums"][col]
    cut_edges[0] = init["num_cut_edges"]

    i = 0
    with open(jsonl_path) as f:
        for line in f:
            if not line.startswith('{"step"'):
                continue
            step = json.loads(line)["step"]
            i += 1
            a, b = step["dists"]
            assignments[i] = assignments[i - 1]
            assignments[i, step["nodes"][0]] = a
            assignments[i, step["nodes"][1]] = b
            populations[i] = populations[i - 1]
            populations[i, [a, b]] = step["populations"]
            for col in sum_cols:
                sums[col][i] = sums[col][i - 1]
                sums[col][i, [a, b]] = step["sums"][col]
            cut_edges[i] = step["num_cut_edges"]
    if i + 1 != n_plans:
        raise ValueError(f"Expected {n_plans} plans, rebuilt {i + 1}")

    _verify(assignments, populations, sums, tallies, num_dists)

    np.savez_compressed(
        out_npz,
        node_ids=np.array(nodes),
        assignments=assignments,
        populations=populations,
        cut_edges=cut_edges,
        **{f"sum_{c}": v for c, v in sums.items()},
    )
    return {
        "n_plans": int(len(assignments)),
        "n_nodes": int(assignments.shape[1]),
        "num_dists": int(num_dists),
        "sum_cols": sorted(sums),
        "rustrecom_config": json.loads(meta["config"]),
    }


def _verify(assignments, populations, sums, tallies, num_dists) -> None:
    """Spot-check rebuilt tallies against a direct recomputation from node values."""
    for i in np.linspace(0, len(assignments) - 1, 25).astype(int):
        direct = np.bincount(
            assignments[i], weights=tallies[POP_COL], minlength=num_dists
        )
        if not np.array_equal(direct.astype(np.int64), populations[i]):
            raise AssertionError(f"Population mismatch at plan {i}")
        for col, values in sums.items():
            direct = np.bincount(
                assignments[i], weights=tallies[col], minlength=num_dists
            )
            if not np.array_equal(direct.astype(np.int64), values[i]):
                raise AssertionError(f"{col} mismatch at plan {i}")


def write_manifest(
    path: Path,
    module_slug: str,
    preset: Preset,
    run_facts: dict,
    seed_source: str,
    seed_repairs: list[str],
    graph_json: Path,
) -> None:
    manifest = {
        "module_slug": module_slug,
        "preset": preset.key,
        "label": preset.label,
        "variant": preset.variant,
        "region_weights": preset.region_weights,
        "pop_col": POP_COL,
        "region_col": COUNTY_COL,
        "seed": {"source": seed_source, "repairs": seed_repairs},
        "graph_json": str(graph_json),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **run_facts,
    }
    path.write_text(json.dumps(manifest, indent=1))
