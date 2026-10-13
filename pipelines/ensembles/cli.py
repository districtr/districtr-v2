import json
import logging
from pathlib import Path

import click

from ensembles import chain, graph, score
from ensembles.presets import PRESETS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@click.group()
def ensembles() -> None:
    """Generate ReCom ensembles for a map module."""
    pass


@ensembles.command("build-graph")
@click.option("--vtd-gpkg", required=True, help="VTD GeoPackage (GerryDB export)")
@click.option("--block-gpkg", required=True, help="Block GeoPackage (GerryDB export)")
@click.option(
    "--seed-csv", required=True, help="Block-level plan CSV (GEOID20, District)"
)
@click.option("--out", "-o", required=True, help="Output graph JSON path")
def build_graph(vtd_gpkg: str, block_gpkg: str, seed_csv: str, out: str) -> None:
    """Build the chain input graph with the seed plan attached.

    Writes the graph JSON and, next to it, a `.seed.json` with the repair log.
    """
    g = graph.load_vtd_graph(vtd_gpkg)
    seed = graph.seed_from_block_csv(g, vtd_gpkg, block_gpkg, seed_csv)
    repairs = graph.repair_seed(g, seed)
    for line in repairs:
        logger.info("seed repair: %s", line)
    graph.write_graph_json(g, seed, out)
    Path(out).with_suffix(".seed.json").write_text(
        json.dumps({"source": seed_csv, "repairs": repairs}, indent=1)
    )
    logger.info("Wrote %s", out)


@ensembles.command("run")
@click.option("--graph-json", required=True, help="Graph JSON from build-graph")
@click.option(
    "--module-slug", required=True, help="districtr_map_slug the ensemble belongs to"
)
@click.option(
    "--preset",
    "presets",
    multiple=True,
    type=click.Choice(sorted(PRESETS)),
    default=sorted(PRESETS),
    show_default=True,
)
@click.option(
    "--n-steps", default=100_000, show_default=True, help="Accepted steps (plans)"
)
@click.option("--rng-seed", default=1, show_default=True)
@click.option("--tol", default=0.01, show_default=True, help="Population tolerance")
@click.option(
    "--out-dir",
    "-o",
    required=True,
    help="Directory for <preset>.npz and <preset>.json",
)
@click.option("--keep-jsonl", is_flag=True, help="Keep rustrecom's raw jsonl output")
def run(
    graph_json: str,
    module_slug: str,
    presets: tuple[str, ...],
    n_steps: int,
    rng_seed: int,
    tol: float,
    out_dir: str,
    keep_jsonl: bool,
) -> None:
    """Run each preset's chain with rustrecom and pack the plans into npz files."""
    graph_path = Path(graph_json)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    seed_info = json.loads(graph_path.with_suffix(".seed.json").read_text())
    sum_cols = graph.election_columns(_node_attributes(graph_path))

    for key in presets:
        preset = PRESETS[key]
        jsonl = out / f"{key}.jsonl"
        config = chain.chain_config(
            graph_path, preset, n_steps, rng_seed, tol, sum_cols, jsonl
        )
        logger.info("Running %s (%s), %d steps", preset.label, preset.variant, n_steps)
        chain.run_chain(config, out / f"{key}.config.json")
        facts = chain.pack(graph_path, jsonl, out / f"{key}.npz")
        chain.write_manifest(
            out / f"{key}.json",
            module_slug,
            preset,
            facts,
            seed_info["source"],
            seed_info["repairs"],
            graph_path,
        )
        if not keep_jsonl:
            jsonl.unlink()
        logger.info("Packed %d plans into %s", facts["n_plans"], out / f"{key}.npz")


@ensembles.command("score")
@click.option("--npz", required=True, help="Packed ensemble npz from `ensembles run`")
@click.option("--vtd-gpkg", required=True, help="VTD GeoPackage (GerryDB export)")
@click.option(
    "--n-plans",
    type=int,
    default=None,
    help="Score only the first N plans (default: every plan in the npz)",
)
@click.option("--out", "-o", required=True, help="Output <preset>.scores.npz path")
def score_cmd(npz: str, vtd_gpkg: str, n_plans: int | None, out: str) -> None:
    """Score an ensemble's plans for compactness and county splits with gerrytools."""
    out_path = Path(out)
    facts = score.score_ensemble(npz, vtd_gpkg, n_plans)
    score.write_npz(out_path, facts)
    score.write_manifest(out_path.with_suffix(".json"), npz, vtd_gpkg, facts)
    logger.info("Wrote %d plans' scores to %s", facts["n_plans"], out_path)


def _node_attributes(graph_path: Path) -> list[str]:
    data = json.load(open(graph_path))
    return [k for k in data["nodes"][0] if k != "id"]
