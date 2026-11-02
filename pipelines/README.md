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
python cli.py ensembles optimize \
    --ensemble-dir ../data/ensembles/co_congressional_districts_v2 \
    --vtd-gpkg ../data/gerrydb/co_districtr_vtd_view_v2.gpkg \
    --graph-npz co_districtr_view_v2.npz
python cli.py ensembles analyze \
    --ensemble-dir ../data/ensembles/co_congressional_districts_v2 \
    --vtd-gpkg ../data/gerrydb/co_districtr_vtd_view_v2.gpkg \
    --graph-npz co_districtr_view_v2.npz
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
the state's UTM zone, the zone most VTD centroids fall in, as the app's
evaluation panel measures compactness) and then scores plans with its
compiled Rust engine, at roughly 1 ms per plan. Every
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
static package the app reads, under `<ensemble dir>/package/`. For a
shatterable module pass `--graph-npz` (the combined block/VTD graph from
`transforms create-graph`): cut edges are then counted between blocks, summing
the graph's block-adjacency weights over each plan's cut VTD edges, which is
the unit the app scores such a module in. Without it, cut edges are the chain's
VTD-level counts. The unit is recorded as `unit_type` on the `cut_edges`
distribution and on every segment step.

- `index.json` — `module_slug` and the packaged presets: `key`, `label`,
  `default` (`recom_b`), `n_plans`, `generated_at`.
- `<preset>/summary.json` — one distribution per series: `kind`, `edges`,
  `counts`, `median`, `min`, `max`. Integer series (seats, district counts,
  splits, cut edges) have one bucket per integer from min to max; a float
  series with at most 32 distinct values is `discrete`, its `edges` being
  those exact values; continuous series have 100 equal-width buckets over
  min..max and a 201-point `quantiles` table (q = 0, 0.005, …, 1). Per-election metrics nest by election
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
  dissolved from the VTDs in the state's UTM zone, filled with the app's zone
  palette and simplified to at most 10 KB.
- `<preset>/manifest.json` — package version, segment, and the chain and
  scoring manifests.

`publish --module-slug <slug>` uploads `package/` to
`s3://<S3_BUCKET>/ensembles/<slug>/` with the credentials in `.env`;
`--dry-run` lists the files and keys without uploading.
`--alias <other slug>` additionally writes an `index.json` under the other
module's slug whose presets carry `"package": "<slug>"`, the folder the app
then reads them from. A custom-districts module shares its base module's
ensemble this way (Colorado: `--alias co_custom_districts_v2`); the app's
district-count gate admits only plans of the ensemble's size.

`publish` uploads every file under `package/`, the analysis files below
included, each gzip-encoded (`Content-Encoding: gzip`): the CDN serves
objects as stored, and a chunk of sampled plans is 840 KB of JSON against
100 KB compressed.

### Optimization

`optimize` (`--ensemble-dir`, `--vtd-gpkg`; `--preset` and `--objective`
repeatable, every one by default) searches each preset's space for the
extremes of one objective at a time by short bursts (Cannon et al. 2023): a
burst runs the preset's rustrecom chain for `--burst-length` accepted steps
(10) from the current plan, every visited plan is scored with the same
gerrytools metrics as the ensemble, and the next burst starts from the best
plan seen so far (the latest of equals on a tie). A restart ends after
`--bursts` bursts (500) or once `--plateau` consecutive bursts (150) bring no
strict improvement. Each restart starts from one plan of the preset's chain,
`--seeds` (plan indices `0,33333,66666`); `--rng-seed` seeds the bursts. Pass
`--graph-npz` (the combined block/VTD graph from `transforms create-graph`)
for a shatterable module so cut edges are counted between blocks, as in the
package. The chain's input graph is `<ensemble-dir>/graph.json`
unless `--graph-json` names another.

| Objective | Direction | Definition |
| --- | --- | --- |
| `dem_seats` | max | Democratic seats summed over the tallied elections, plus the mean over those elections of the Democratic two-party share in the closest district the Democrat loses (0.5 in an election it sweeps); the fraction stays at most 0.5, so a seat always outweighs it |
| `rep_seats` | max | the Republican mirror of `dem_seats` |
| `competitive` | max | (district, election) contests with a Democratic two-party share strictly within 3 points of 50%, summed over elections (gerrytools' `CompetitiveContests`) |
| `county_splits` | min | counties assigned to more than one district |
| `cut_edges` | min | cut edges, between blocks with `--graph-npz`, between VTDs otherwise |
| `polsby_popper` | max | mean Polsby-Popper over districts |

Objectives and constraints read only partisan tallies, counties, adjacency
and geometry; racial shares, where a module has them, are scored after
generation.

Per preset and objective it writes `optimize/<preset>/<objective>.npz`, every
visited plan with `assignments`, `restart`, `burst` (0 for a seed), `parent`
(the row the plan was proposed from), `value`, `cut_edges` and every score
array, and `<objective>.json`, the run's parameters, the rows of the five best
plans that differ pairwise in at least 10% of VTDs (districts matched to
maximise overlap, so relabelling counts as no difference), and per restart
the seed plan, best value, bursts run, stop reason and wall time. On
Colorado a burst takes about 80 ms; the twelve runs (two presets, six
objectives, three restarts of up to 500 bursts) take about three minutes run
side by side, one process each.

### Analysis files

`analyze` (`--ensemble-dir`, `--vtd-gpkg`, `--graph-npz`, `--preset`,
`--shuffle-seed`) writes these files into `package/<preset>/` beside the
package's own, from the chain npz, its scores and the preset's `optimize` runs,
then refreshes `index.json`. Run `package` first. Assignments in these files
list the app's 1-based district numbers in the order of `config.json`'s
`node_ids`; a metrics payload is a segment step without its `plan` field; a
series reference is `{"metric", "election", "stat"}`, the nesting of
`summary.json`.

- `bounds.json` — `objectives`, one per optimized objective: `key`, `label`,
  `direction`, `objective` (its definition in words), `best_value`,
  `restarts` (each restart's best value), `run` (`method`, `burst_length`,
  `bursts`, `plateau`, `restarts`, `seeds`), and `plans`, up to five distinct
  plans best first, each `file`, `thumb`, `value` and `metrics`.
- `extremes/<objective>/<k>.json` and `.svg` — those plans, `k` = 0 for the
  best: `objective`, `rank` (1 for the best), `value`, `assignment`,
  `metrics`, and a thumbnail in the segment's style.
- `joint/index.json` — `pairs`, each `id`, `x` and `y` (series references),
  `file`, and `why` (the reason the pair is informative). Colorado's four:
  disproportionality (pres_24) × county splits, competitive contests ×
  disproportionality (pres_24), cut edges × county splits, Democratic seats
  (pres_24) × cut edges.
- `joint/<id>.json` — the sample's two-way counts: `x`, `y`, `x_kind`,
  `x_edges`, `y_kind`, `y_edges`, `counts` (one row per y bucket, one column
  per x bucket) and `n`, the plans where both series are finite. Kinds and
  edges follow `summary.json`, except that continuous series, and integer
  series spanning more than 50 values (block cut edges), get 50 equal-width
  `continuous` buckets.
- `chunks/<k>.json`, `k` = 0..999 — the chain shuffled
  (`numpy.random.default_rng(shuffle_seed).permutation`) and cut into chunks
  of 100: `chunk` and `plans`, each `plan` (chain index), `assignment` and
  `metrics`. Each chunk is a random sample of 100 plans.
- `geometry.json` — `width`, `height` (the thumbnails' viewBox) and `paths`,
  one SVG path per unit in `node_ids` order, simplified as a coverage at two
  viewBox units, so the app draws any assignment itself by filling each path
  with its zone's colour (about 200 KB, 60 KB gzipped).
- `trajectory/<objective>.json` and `trajectory/<objective>/<i>.svg` — the
  chain path by which the best restart reached its best plan, each step one
  recombination from the last, subsampled evenly to at most 200 steps with
  both ends kept: `objective`, `seed_plan`, `path_length`, and `steps`, each
  `burst`, `value`, `metrics` and `thumb`.
- `config.json` — `analysis` (the flags below), the chain and scoring
  manifests, `cut_edges_unit_type`, every objective's run configuration and
  per-restart results, the joint bucket count and pairs, the chunk size and
  shuffle seed, the geometry's viewBox width and tolerance, the trajectory
  rule, software versions and `node_ids`.

`index.json` gives each analysed preset `"analysis": {"bounds", "joint",
"chunks", "geometry", "trajectory"}` (`chunks` is the chunk count). On Colorado `analyze`
takes two to five minutes per preset, and a preset's analysis files take about
815 MB: 800 MB of chunks (about 840 KB each, 100 KB gzipped), 11 to 15 MB of
trajectories, 0.7 MB of extremes, and tens of KB for bounds, joint counts and
config.
