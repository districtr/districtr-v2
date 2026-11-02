import gzip
import json
import logging
import time
from pathlib import Path

import click
import numpy as np

from ensembles import chain, graph, package
from ensembles.presets import PRESETS

# The optimize module's objective keys, listed here so the CLI loads without
# gerrytools' dependencies.
OBJECTIVE_KEYS = (
    "dem_seats",
    "rep_seats",
    "competitive",
    "county_splits",
    "cut_edges",
    "polsby_popper",
)

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
@click.option("--vtd-gpkg", required=True, help="VTD GeoPackage (GerryDB export)")
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
    help="Ensemble directory: chain, score and package outputs go here",
)
@click.option("--keep-jsonl", is_flag=True, help="Keep rustrecom's raw jsonl output")
@click.option(
    "--graph-npz",
    default=None,
    help="Combined block/VTD graph npz; cut edges are then counted between blocks",
)
def run(
    graph_json: str,
    vtd_gpkg: str,
    module_slug: str,
    presets: tuple[str, ...],
    n_steps: int,
    rng_seed: int,
    tol: float,
    out_dir: str,
    keep_jsonl: bool,
    graph_npz: str | None,
) -> None:
    """Run, score and package each preset.

    Each chain runs in rustrecom and is packed into <preset>.npz; every plan is then
    scored (<preset>.scores.npz) and the package (package/) is rebuilt."""
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
        started = time.monotonic()
        chain.run_chain(config, out / f"{key}.config.json")
        logger.info("%s chain: %.1fs", key, time.monotonic() - started)
        started = time.monotonic()
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
        logger.info(
            "%s pack: %d plans into %s, %.1fs",
            key,
            facts["n_plans"],
            out / f"{key}.npz",
            time.monotonic() - started,
        )
        started = time.monotonic()
        _score(out / f"{key}.npz", vtd_gpkg, None, out / f"{key}.scores.npz")
        logger.info("%s score: %.1fs", key, time.monotonic() - started)
        started = time.monotonic()
        package.write_preset(out, key, vtd_gpkg, graph_npz=graph_npz)
        logger.info("%s package: %.1fs", key, time.monotonic() - started)
    package.write_index(out / package.PACKAGE_DIRNAME, module_slug)


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
    """Score an ensemble's plans with gerrytools (partisan, competitiveness,
    compactness and county-split metrics)."""
    _score(Path(npz), vtd_gpkg, n_plans, Path(out))


def _score(npz: Path, vtd_gpkg: str, n_plans: int | None, out: Path) -> None:
    from ensembles import score  # gerrytools is installed only in the ensembles venv

    facts = score.score_ensemble(npz, vtd_gpkg, n_plans)
    score.write_npz(out, facts)
    score.write_manifest(out.with_suffix(".json"), npz, vtd_gpkg, facts)
    logger.info("Wrote %d plans' scores to %s", facts["n_plans"], out)


@ensembles.command("package")
@click.option(
    "--ensemble-dir",
    required=True,
    help="Directory holding <preset>.npz, <preset>.scores.npz and their manifests",
)
@click.option(
    "--module-slug", required=True, help="districtr_map_slug the ensemble belongs to"
)
@click.option("--vtd-gpkg", required=True, help="VTD GeoPackage (GerryDB export)")
@click.option(
    "--preset",
    "presets",
    multiple=True,
    type=click.Choice(sorted(PRESETS)),
    default=sorted(PRESETS),
    show_default=True,
)
@click.option(
    "--segment-start",
    default=package.SEGMENT_START,
    show_default=True,
    help="Plan index of the segment's first step",
)
@click.option(
    "--graph-npz",
    default=None,
    help="Combined block/VTD graph npz; cut edges are then counted between blocks",
)
def package_cmd(
    ensemble_dir: str,
    module_slug: str,
    vtd_gpkg: str,
    presets: tuple[str, ...],
    segment_start: int,
    graph_npz: str | None,
) -> None:
    """Build the app's static package (<ensemble-dir>/package/) from scored presets."""
    out = Path(ensemble_dir)
    for key in presets:
        folder = package.write_preset(out, key, vtd_gpkg, segment_start, graph_npz)
        logger.info("Wrote %s", folder)
    package.write_index(out / package.PACKAGE_DIRNAME, module_slug)


def _seed_plans(value: str) -> tuple[int, ...]:
    try:
        return tuple(int(v) for v in value.split(","))
    except ValueError:
        raise click.BadParameter("comma-separated plan indices") from None


@ensembles.command("optimize")
@click.option(
    "--ensemble-dir",
    required=True,
    help="Directory holding graph.json and <preset>.npz with its manifest",
)
@click.option("--vtd-gpkg", required=True, help="VTD GeoPackage (GerryDB export)")
@click.option(
    "--preset",
    "presets",
    multiple=True,
    type=click.Choice(sorted(PRESETS)),
    default=sorted(PRESETS),
    show_default=True,
)
@click.option(
    "--objective",
    "objectives",
    multiple=True,
    type=click.Choice(list(OBJECTIVE_KEYS)),
    default=list(OBJECTIVE_KEYS),
    show_default=True,
)
@click.option(
    "--graph-json",
    default=None,
    help="Chain input graph [default: <ensemble-dir>/graph.json]",
)
@click.option(
    "--graph-npz",
    default=None,
    help="Combined block/VTD graph npz; cut edges are then counted between blocks",
)
@click.option("--burst-length", default=10, show_default=True)
@click.option("--bursts", default=500, show_default=True, help="Bursts per restart")
@click.option(
    "--plateau",
    default=150,
    show_default=True,
    help="Stop a restart after this many bursts without improvement",
)
@click.option(
    "--seeds",
    default="0,33333,66666",
    show_default=True,
    help="Chain plan indices to restart from, comma-separated",
)
@click.option("--rng-seed", default=20261027, show_default=True)
def optimize_cmd(
    ensemble_dir: str,
    vtd_gpkg: str,
    presets: tuple[str, ...],
    objectives: tuple[str, ...],
    graph_json: str | None,
    graph_npz: str | None,
    burst_length: int,
    bursts: int,
    plateau: int,
    seeds: str,
    rng_seed: int,
) -> None:
    """Short-burst optimization of each objective for each preset.

    Writes optimize/<preset>/<objective>.npz (every visited plan with its scores)
    and .json (run facts) under the ensemble directory."""
    from ensembles import optimize, score

    out = Path(ensemble_dir)
    graph_path = Path(graph_json) if graph_json else out / "graph.json"
    seed_plans = _seed_plans(seeds)
    for key in presets:
        chain_npz = np.load(out / f"{key}.npz")
        node_ids = chain_npz["node_ids"]
        assignments = chain_npz["assignments"]
        manifest = json.loads((out / f"{key}.json").read_text())
        tol = manifest["rustrecom_config"]["tol"]
        evaluator, elections = score.make_evaluator(node_ids, vtd_gpkg)
        counter = (
            package.CutEdgeCounter.blocks(node_ids, graph_npz)
            if graph_npz
            else package.CutEdgeCounter.units(node_ids, graph_path)
        )
        scorer = optimize.Scorer(evaluator, elections, counter)
        for objective_key in objectives:
            objective = optimize.OBJECTIVES[objective_key]
            runner = optimize.BurstRunner(
                graph_path,
                PRESETS[key],
                tol,
                out / optimize.OPTIMIZE_DIRNAME / key / f".work-{objective_key}",
            )
            if not np.array_equal(runner.node_ids, node_ids):
                raise click.ClickException(f"{graph_path} and {key}.npz disagree")
            started = time.monotonic()
            try:
                result = optimize.optimize(
                    objective,
                    runner,
                    scorer,
                    assignments,
                    seed_plans,
                    burst_length,
                    bursts,
                    plateau,
                    rng_seed,
                    label=f"{key} {objective_key}",
                )
            finally:
                runner.close()
            params = {
                "preset": key,
                "variant": PRESETS[key].variant,
                "region_weights": PRESETS[key].region_weights,
                "tol": tol,
                "burst_length": burst_length,
                "bursts": bursts,
                "plateau": plateau,
                "seeds": list(seed_plans),
                "rng_seed": rng_seed,
                "elections": elections,
                "cut_edges_unit_type": counter.unit_type,
                "wall_time_seconds": round(time.monotonic() - started, 1),
            }
            path = optimize.write_run(out, key, objective, result, params)
            logger.info("Wrote %s (%.0fs)", path, params["wall_time_seconds"])


@ensembles.command("analyze")
@click.option(
    "--ensemble-dir",
    required=True,
    help="Directory holding <preset>.npz, <preset>.scores.npz, their manifests "
    "and any optimize/ runs",
)
@click.option("--vtd-gpkg", required=True, help="VTD GeoPackage (GerryDB export)")
@click.option(
    "--preset",
    "presets",
    multiple=True,
    type=click.Choice(sorted(PRESETS)),
    default=sorted(PRESETS),
    show_default=True,
)
@click.option(
    "--graph-npz",
    default=None,
    help="Combined block/VTD graph npz; cut edges are then counted between blocks",
)
@click.option(
    "--shuffle-seed",
    default=20261027,
    show_default=True,
    help="Seed of the chain's shuffle into chunks",
)
def analyze_cmd(
    ensemble_dir: str,
    vtd_gpkg: str,
    presets: tuple[str, ...],
    graph_npz: str | None,
    shuffle_seed: int,
) -> None:
    """Write each preset's analysis files into the package: bounds, extremes,
    joint counts, chunks, trajectories and config.json; then refresh index.json.

    Run `package` first; bounds, extremes and trajectories need `optimize` runs."""
    from ensembles import analysis

    out = Path(ensemble_dir)
    for key in presets:
        started = time.monotonic()
        folder = analysis.write_analysis(out, key, vtd_gpkg, graph_npz, shuffle_seed)
        logger.info("Wrote %s analysis (%.0fs)", folder, time.monotonic() - started)
    module_slug = json.loads((out / f"{presets[0]}.json").read_text())["module_slug"]
    package.write_index(out / package.PACKAGE_DIRNAME, module_slug)


@ensembles.command("publish")
@click.option(
    "--module-slug", required=True, help="districtr_map_slug the ensemble belongs to"
)
@click.option(
    "--package-dir",
    default=None,
    help="Package folder [default: ../data/ensembles/<module-slug>/package]",
)
@click.option(
    "--alias",
    "aliases",
    multiple=True,
    help="Another module slug that reads this package (e.g. the custom-districts "
    "module); gets an index.json of its own pointing here. Repeatable.",
)
@click.option("--dry-run", is_flag=True, help="List the uploads without uploading")
def publish(
    module_slug: str, package_dir: str | None, aliases: tuple[str, ...], dry_run: bool
) -> None:
    """Upload a module's package to s3://<S3_BUCKET>/ensembles/<module-slug>/,
    plus an index.json under each --alias slug that points at it."""
    from core.settings import settings

    folder = (
        Path(package_dir)
        if package_dir
        else Path("../data/ensembles") / module_slug / package.PACKAGE_DIRNAME
    )
    if not (folder / "index.json").exists():
        raise click.ClickException(f"{folder} has no index.json; run package first")
    targets = package.upload_targets(folder, module_slug)
    index = json.loads((folder / "index.json").read_text())
    alias_dir = folder / package.ALIASES_DIRNAME
    for alias in aliases:
        alias_path = alias_dir / alias / "index.json"
        alias_path.parent.mkdir(parents=True, exist_ok=True)
        alias_path.write_text(
            json.dumps(package.alias_index(index, alias, module_slug), indent=1)
        )
        targets.append((alias_path, f"ensembles/{alias}/index.json"))
    s3_client = None if dry_run else settings.get_s3_client()
    if not dry_run and s3_client is None:
        raise click.ClickException("S3 client is not initialized")
    for path, key in targets:
        uri = f"s3://{settings.S3_BUCKET}/{key}"
        if dry_run:
            click.echo(f"{uri}\t{path.stat().st_size}")
            continue
        # The CDN serves objects as stored, so every file goes up gzip-encoded:
        # a chunk is 840 KB of JSON and 100 KB compressed.
        s3_client.put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=gzip.compress(path.read_bytes()),
            ContentType=package.content_type(path),
            ContentEncoding="gzip",
        )
        logger.info("Uploaded %s", uri)
    logger.info("%s %d files", "Would upload" if dry_run else "Uploaded", len(targets))


def _node_attributes(graph_path: Path) -> list[str]:
    data = json.load(open(graph_path))
    return [k for k in data["nodes"][0] if k != "id"]
