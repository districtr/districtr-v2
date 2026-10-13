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
plans the evaluation panel uses as a reference distribution for its metrics.
The chain itself runs in [rustrecom](https://github.com/mggg/frcw.rs) (the Rust
ReCom implementation behind Cannon, Duchin, Randall & Rule 2025); this package
builds its input graph, drives it, scores every plan with
[gerrytools](https://gerrytools.readthedocs.io/), and builds the static data
package the app reads from S3.

Scoring pins gerrytools 2.0.1 and its newer pandas, geopandas and pyarrow, so
the ensembles commands run in their own venv, built from
`requirements-ensembles.txt` instead of `requirements.txt`:

```sh
uv venv ~/.venvs/districtr-ensembles
source ~/.venvs/districtr-ensembles/bin/activate
uv pip install -r requirements-ensembles.txt
```

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
    --vtd-gpkg ../data/gerrydb/co_districtr_vtd_view_v2.gpkg \
    --module-slug co_congressional_districts_v2 \
    --n-steps 100000 --rng-seed 20261008 \
    -o ../data/ensembles/co_congressional_districts_v2
python cli.py ensembles publish \
    --module-slug co_congressional_districts_v2 --dry-run
```

`build-graph` takes adjacency from the GeoPackage's GerryDB edge layer, attaches
integer population and election tallies plus the county of every VTD, and
derives the seed by giving each VTD the district holding most of its
population. Where that leaves a district in pieces, the seed is repaired
(bridging VTD flipped in, tiny fragments handed to a neighbour) and the moves
are logged in `graph.seed.json`.

`run` executes every preset in `ensembles/presets.py` (ReCom-B and county-aware
ReCom-B; population tolerance 1%), then scores and packages each one. Per
preset it writes:

- `<preset>.npz` — `assignments` (plans × VTDs, uint8 district index),
  `node_ids`, `populations` and `sum_<column>` (plans × districts), `cut_edges`
- `<preset>.json` — manifest: module, preset, chain parameters as rustrecom
  echoed them, seed source and repairs, plan counts
- `<preset>.config.json` — the rustrecom config that was run
- `<preset>.scores.npz` and `<preset>.scores.json` — see `score` below
- `package/<preset>/` — see `package` below

Each step of a non-reversible rustrecom chain is an accepted proposal, so
`--n-steps` is the number of stored plans. On Colorado's 3,158 VTDs and 8
districts, a 100,000-step preset takes about 35 seconds to run, 15 seconds to
pack (roughly 30 MB), 100 seconds to score and 10 to 30 seconds to package.

### Scoring

`score` (run by `run`; also standalone, with `--n-plans N` to score only the
first N plans) evaluates every plan with gerrytools' engine-backed
`PlanEvaluator`, which prepares VTD geometry and columns once (reprojected to
EPSG:5070, the equal-area projection the app's evaluation panel uses) and then
scores plans with its compiled Rust engine, at roughly 1 ms per plan. Every
series is a gerrytools metric class, from the Democratic point of view:

| Series in `<preset>.scores.npz` | gerrytools class | Shape |
| --- | --- | --- |
| `seats__<e>`, `rep_seats__<e>` | `Seats` (Democratic, Republican) | plans |
| `efficiency_gap__<e>` | `EfficiencyGap` | plans |
| `mean_median__<e>` | `MeanMedian` | plans |
| `partisan_bias__<e>` | `PartisanBias` | plans |
| `disproportionality__<e>` | `Disproportionality` | plans |
| `eguia__<e>` | `Eguia` (region county, population `total_pop_20`) | plans |
| `district_vote_shares__<e>` | `DistrictVoteShares` | plans × districts |
| `n_dem_districts` | `PartyDistricts` (all elections) | plans |
| `n_rep_districts` | `OppositionPartyDistricts` (all elections) | plans |
| `n_swing_districts` | `SwingDistricts` (all elections) | plans |
| `n_competitive_contests` | `CompetitiveContests` (margin 0.03) | plans |
| `county_splits`, `county_pieces` | `RegionSplits`, `RegionPieces` | plans |
| `polsby_popper`, `reock` | `PolsbyPopper`, `Reock` | plans × districts |
| `<compactness>_mean`, `_min`, `_max` | across districts | plans |

`<e>` is every election key with `<e>_dem` and `<e>_rep` columns. District
columns follow the 0-based district ids of `assignments`. The `.scores.json`
manifest records the definitions, gerrytools version, CRS and wall time.

### Package

`package` (run by `run`; also standalone, `--ensemble-dir`, `--module-slug`,
`--vtd-gpkg`) reads only the npz files and their manifests and writes the
static package the app reads, under `<ensemble dir>/package/`:

- `index.json` — `module_slug` and the packaged presets: `key`, `label`,
  `default` (`recom_b`), `n_plans`, `generated_at`.
- `<preset>/summary.json` — one distribution per series: `kind`, `edges`,
  `counts`, `median`, `min`, `max`. Integer series (seats, district counts,
  splits, cut edges) have one bucket per integer from min to max; continuous
  series have 100 equal-width buckets over min..max and a 201-point
  `quantiles` table (q = 0, 0.005, …, 1). Per-election metrics nest by election
  key; compactness nests by `mean`, `min`, `max` and `districts` (every
  district of every plan). `ftv` holds the Freedom to Vote Act test as the
  evaluation panel applies it: its four elections, the threshold
  max(0.07, 1/districts), and the share of plans within it in at least three.
- `<preset>/segment.json` — `start` (plan 50,000) and 100 consecutive `steps`,
  each holding one plan's metrics keyed and shaped like the app's evaluation
  payload (`seats`, `efficiency_gap`, `mean_median`, `partisan_bias`,
  `disproportionality`, `eguia`, `competitiveness`, `polsby_popper`, `reock`,
  `cut_edges`), plus `county_splits` as `{splits, pieces}`. District keys are
  the app's 1-based zone numbers.
- `<preset>/thumbs/000.svg` … `099.svg` — each segment step's districts,
  dissolved from the VTDs in EPSG:5070, filled with the app's zone palette and
  simplified to at most 10 KB.
- `<preset>/manifest.json` — package version, segment, and the chain and
  scoring manifests.

`publish --module-slug <slug>` uploads `package/` to
`s3://<S3_BUCKET>/ensembles/<slug>/` with the credentials in `.env`;
`--dry-run` lists the files and keys without uploading.
