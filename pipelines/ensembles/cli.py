import json
import logging
import time
from pathlib import Path

import click

from ensembles import chain, graph, package
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
        package.write_preset(out, key, vtd_gpkg)
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
def package_cmd(
    ensemble_dir: str,
    module_slug: str,
    vtd_gpkg: str,
    presets: tuple[str, ...],
    segment_start: int,
) -> None:
    """Build the app's static package (<ensemble-dir>/package/) from scored presets."""
    out = Path(ensemble_dir)
    for key in presets:
        folder = package.write_preset(out, key, vtd_gpkg, segment_start)
        logger.info("Wrote %s", folder)
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
@click.option("--dry-run", is_flag=True, help="List the uploads without uploading")
def publish(module_slug: str, package_dir: str | None, dry_run: bool) -> None:
    """Upload a module's package to s3://<S3_BUCKET>/ensembles/<module-slug>/."""
    from core.settings import settings

    folder = (
        Path(package_dir)
        if package_dir
        else Path("../data/ensembles") / module_slug / package.PACKAGE_DIRNAME
    )
    if not (folder / "index.json").exists():
        raise click.ClickException(f"{folder} has no index.json; run package first")
    targets = package.upload_targets(folder, module_slug)
    s3_client = None if dry_run else settings.get_s3_client()
    if not dry_run and s3_client is None:
        raise click.ClickException("S3 client is not initialized")
    for path, key in targets:
        uri = f"s3://{settings.S3_BUCKET}/{key}"
        if dry_run:
            click.echo(f"{uri}\t{path.stat().st_size}")
            continue
        s3_client.upload_file(
            str(path),
            settings.S3_BUCKET,
            key,
            ExtraArgs={"ContentType": package.content_type(path)},
        )
        logger.info("Uploaded %s", uri)
    logger.info("%s %d files", "Would upload" if dry_run else "Uploaded", len(targets))


def _node_attributes(graph_path: Path) -> list[str]:
    data = json.load(open(graph_path))
    return [k for k in data["nodes"][0] if k != "id"]
