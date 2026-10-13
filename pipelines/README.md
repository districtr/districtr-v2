# Pipelines

Where data processing/ELT that can happen outside the API should go. Currently all pipelines are run locally.
This project does not presently necessitate an orchestrator or cloud infra beyond object storage.
Most Input datasets come from the gerrydb project.

Structure:

- `core`: Shared configuration and models. No commands
- `tabular`: Demography and other tabular data handling.
- `tilesets`: CLI for creating tilesets consumed by Districtr v2.

## Quickstart

Using docker:

```sh
docker-compose run pipelines sh
```

From within the `pipelines` service, run commands:

```sh
python cli.py tileset create-gerrydb-tileset ...
python cli.py tabular build-parquet ...
```

## Installation

If running locally, create an environment and install deps:

```bash
uv venv
source .venv/bin/activate # for unix
uv pip install -r requirements.txt
```

To install the package in development mode run the following command from the pipelines directory:

```bash
pip install -e .
```

This will install the package in development mode, which means that any changes you make to the code will be immediately reflected in the installed package.

## Environment

The pipelines CLI requires access to S3 for many commands.

```bash
cp .env.example .env
```

And update the `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` env vars at a minimum.

All files created by the pipelines will be saved to `/tmp` by default. This can be overriden with the `OUT_SCRATCH` env var.

## Adding modules

You can add new modules by creating a click group in a new subdirectory and importing the click group to `./cli.py` and adding `cli.add_command(<my_new_module>)`. This will make your new command group's commands accessible as part of the larger CLI:

```bash
$ python cli.py --help
Usage: cli.py [OPTIONS] COMMAND [ARGS]...

  Main entry point for the districtr-v2 pipelines CLI.

Options:
  --help  Show this message and exit.

Commands:
  tabular  Tabular analysis commands.
  tileset  Tileset commands.
```

## Ensembles

`ensembles` generates ReCom ensembles for a map module: a set of computer-drawn
plans the evaluation panel uses as a reference distribution for partisan
metrics. The chain itself runs in [rustrecom](https://github.com/mggg/frcw.rs)
(the Rust ReCom implementation behind Cannon, Duchin, Randall & Rule 2025);
this package builds its input graph, drives it, and packs its output.

Build rustrecom once (needs a Rust toolchain, `rustup.rs`):

```sh
git clone https://github.com/mggg/frcw.rs && cd frcw.rs
git checkout f551e02fe6abe2b661e8229f6e57cf2ac585b541
RUSTFLAGS="-C target-cpu=native" cargo build --release --bin rustrecom
export RUSTRECOM_BIN=$PWD/target/release/rustrecom
```

Then, for a module whose VTD and block GeoPackages are in `data/gerrydb/` and
whose seed is a block-level plan CSV (`GEOID20,District`):

```sh
python cli.py ensembles build-graph \
    --vtd-gpkg ../data/gerrydb/co_districtr_vtd_view_v2.gpkg \
    --block-gpkg ../data/gerrydb/co_districtr_block_view_v2.gpkg \
    --seed-csv CO-block-assignments.csv \
    -o ../data/ensembles/co_congressional_districts_v2/graph.json
python cli.py ensembles run \
    --graph-json ../data/ensembles/co_congressional_districts_v2/graph.json \
    --module-slug co_congressional_districts_v2 \
    --n-steps 100000 --rng-seed 20261008 \
    -o ../data/ensembles/co_congressional_districts_v2
```

`build-graph` takes adjacency from the GeoPackage's GerryDB edge layer, attaches
integer population and election tallies plus the county of every VTD, and
derives the seed by giving each VTD the district holding most of its
population. Where that leaves a district in pieces, the seed is repaired
(bridging VTD flipped in, tiny fragments handed to a neighbour) and the moves
are logged in `graph.seed.json`.

`run` executes every preset in `ensembles/presets.py` (ReCom-B and county-aware
ReCom-B; population tolerance 1%) and writes per preset:

- `<preset>.npz` — `assignments` (plans × VTDs, uint8 district index),
  `node_ids`, `populations` and `sum_<column>` (plans × districts), `cut_edges`
- `<preset>.json` — manifest: module, preset, chain parameters as rustrecom
  echoed them, seed source and repairs, plan counts
- `<preset>.config.json` — the rustrecom config that was run

Each step of a non-reversible rustrecom chain is an accepted proposal, so
`--n-steps` is the number of stored plans. A 100,000-step run on Colorado's
3,158 VTDs takes about 35 seconds and packs to roughly 30 MB.

`score` evaluates a packed ensemble's plans for compactness and county splits,
using [gerrytools](https://gerrytools.readthedocs.io/)' engine-backed
`PlanEvaluator`, which prepares VTD geometry once (reprojected to EPSG:5070,
the equal-area projection the app's evaluation panel uses) and then scores
every plan with its compiled Rust engine:

```sh
python cli.py ensembles score \
    --npz ../data/ensembles/co_congressional_districts_v2/recom_b.npz \
    --vtd-gpkg ../data/gerrydb/co_districtr_vtd_view_v2.gpkg \
    --n-plans 10000 \
    -o ../data/ensembles/co_congressional_districts_v2/recom_b.scores.npz
```

It writes, next to the npz:

- `<preset>.scores.npz` — `reock` and `polsby_popper` (plans × districts),
  `county_splits` and `county_pieces` (plans)
- `<preset>.scores.json` — manifest: source npz and GeoPackage, plan count,
  gerrytools version, the metric definitions used, CRS, wall time

`--n-plans` scores only the first N plans of the npz (default: every plan).
Scoring Colorado's 3,158-VTD, 8-district ensemble runs at roughly 1 ms/plan.
