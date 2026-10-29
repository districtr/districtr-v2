---
name: run-map-onboarding
description: Walks through onboarding a new geographic layer (a state's blocks/VTDs, a new district plan's base geography, or a COI-module geography) into a usable Districtr map module — from raw GeoPackage through GerryDB import, tileset and graph generation, map-record creation, and shatter-edge wiring. Use when adding a new map/module, adding columns such as a new election to an onboarded layer, changing which commands or order the onboarding pipeline runs in, or debugging why a newly onboarded map won't load, shatter, or pass contiguity checks.
---

# Map onboarding

Onboarding a map module touches three CLIs — `backend/cli.py` (database records), `pipelines/cli.py` (tileset and graph artifacts), and no others — run against the containerized stack. There is no single onboarding command; this is a fixed sequence of CLI invocations, each producing a prerequisite for the next. Read the map-module section of [`docs/overview.md`](../../../docs/overview.md) first for what each stage's output actually means (GeoPackage → GerryDB → DistrictrMap → tiles → edges → graph) — this runbook is the *how*, that section is the *why*.

None of these commands were run for real while writing this skill (no container access) — flags and argument names are read from the CLI source, not exercised. Run `--help` on the actual command before trusting a flag name here for an unusual case.

## Prerequisite

A source GeoPackage (`.gpkg`) per geographic level you're onboarding (e.g. blocks and VTDs for a shatterable state map), reachable locally or via `s3://`.

## Sequence

### 1. Import the GerryDB view(s)

```bash
docker-compose exec backend python cli.py import-gerrydb-view \
  --layer <layer-name> --gpkg <path-or-s3-uri>
```

Run once per geographic level (once for a parent-only map, twice — parent and child — for a shatterable one). This runs `ogr2ogr` to load the GeoPackage into the `gerrydb` Postgres schema as a table named after `--layer`.

**Verify before proceeding**: the table exists in the `gerrydb` schema with the row count you expect (`docker-compose exec db psql -U postgres -d districtr -c '\dt gerrydb.*'`).

### 2. (Shatterable maps only) Create the shatterable view

```bash
docker-compose exec backend python cli.py create-shatterable-districtr-view \
  --parent-layer-name <parent-layer> --child-layer-name <child-layer> \
  --gerrydb-table-name <table-name>
```

**Verify**: the materialized view is created without error; spot-check that child geometries nest inside their claimed parent.

### 3. Build the tileset

```bash
docker-compose exec pipelines python cli.py tileset create-gerrydb-tileset \
  --layer <layer-name> --gpkg <path-or-s3-uri>
```

For a shatterable map, run this for both levels, then merge:

```bash
docker-compose exec pipelines python cli.py tileset merge-gerrydb-tilesets \
  --out-name <name> --parent-layer <parent-tileset-path> --child-layer <child-tileset-path>
```

This writes tiles locally only — it does not upload. Upload separately (see the pipeline's S3 CLI) and note the resulting `s3://` path; it becomes `--tiles-s3-path` in step 5.

**Verify**: the tileset file exists and opens (e.g. with `tippecanoe-decode` or a local MapLibre preview) before spending time on later steps against a broken tileset.

### 4. Build the contiguity graph

```bash
docker-compose exec pipelines python cli.py transforms create-graph \
  --child-gpkg <child.gpkg> --parent-gpkg <parent.gpkg> \
  --gerrydb-name <gerrydb-table-name> --upload
```

The child GeoPackage must contain a `gerrydb_graph_edge` layer. It comes with the source GeoPackage; no command in this repo produces one. `--gerrydb-name` becomes the S3 key (`graphs/<gerrydb-name>.npz`, read at runtime by `app/evaluation/graph_loader.get_graph`) — it must match the `gerrydb-table-name` used in step 5, or contiguity lookups for the finished map will silently miss the graph.

**Verify**: the command reports a written path; if `--upload`, confirm the object lands at `s3://<bucket>/graphs/<gerrydb-name>.npz`.

### 5. Create the DistrictrMap record

```bash
docker-compose exec backend python cli.py create-districtr-map \
  --name "<display name>" --districtr-map-slug <slug> \
  --parent-layer-name <parent-layer> --child-layer-name <child-layer> \
  --gerrydb-table-name <gerrydb-table-name> --tiles-s3-path <s3-path-from-step-3> \
  --num-districts <n> --group-slug <group> --map-type <default|coi|...>
```

`--districtr-map-slug`, `--gerrydb-table-name` here and `--gerrydb-name` in step 4 must all agree — the app resolves the graph, the tiles, and the GerryDB table independently by these names at request time, with no cross-check between them at creation time.

**Verify**: `SELECT * FROM districtrmap WHERE districtr_map_slug = '<slug>'` shows the expected row; the map is initially safe to leave `visible=false` until the remaining steps pass. Check `statefps` on the new row: the CLI does not fill it automatically (issue #633), and county-brush behavior is silently disabled on any map whose document metadata lacks it.

### 6. End-to-end verification

- `docker-compose exec backend python cli.py check-missing-graphs --skip-alert` confirms the graph npz this map needs is actually reachable in S3.
- Hit `GET /api/gerrydb/views` and create a test `Document` via `POST /api/document` against the new slug; confirm the map loads, shatters (if applicable), and a contiguity check returns without error.
- Only then flip `visible` to `true` (via `update-districtr-map --visibility true`, or leave it visible from creation).

## Adding columns to an onboarded layer

For new data on a state that is already onboarded, such as a new election. Existing values are never changed: every named column must be new, or hold only NULLs left by an interrupted run. Steps 3–5 run in the backend container of each environment, one environment at a time.

1. **Merge the CSV into the GeoPackages** (pipelines). Block values join on the CSV's `geoid20`; each parent's values are the sums of its blocks, with membership read from the map's graph npz. Writes copies of both files to `--out-dir`; the inputs are untouched.

   ```bash
   docker-compose exec pipelines python cli.py transforms add-block-columns \
     -b <block.gpkg> -p <parent.gpkg> --csv <blocks.csv> \
     --graph <graphs/view.npz> --columns <c1,c2> --out-dir <dir>
   ```

2. **Replace the GeoPackages in the bucket's `gerrydb/` prefix** with the two copies, after backing up the originals. The backend reads them only when a command runs.
3. **Fill both tables**, parent and child. The table is the GeoPackage's file name. The command refuses a GeoPackage whose paths don't match the table's exactly.

   ```bash
   docker-compose exec backend python cli.py add-gerrydb-columns \
     --gpkg <s3://…/gerrydb/table.gpkg> --columns <c1,c2>
   ```

4. **Rebuild the shatterable view.** It is built under a temporary name and swapped in; the swap waits up to 10 s for current readers, so run it off-peak.

   ```bash
   docker-compose exec backend python cli.py rebuild-shatterable-view \
     --gerrydb-table-name <view>
   ```

5. **Invalidate cached stats and evaluations**, naming the view and both tables (maps that read a table directly see the columns right after its fill). Run with `--dry-run` first to see the counts per name.

   ```bash
   docker-compose exec backend python cli.py invalidate-document-caches \
     -n <view> -n <parent-table> -n <child-table> [--dry-run]
   ```

6. **Rebuild and upload the view's parquet**, which feeds the frontend's demography table (`tabular build-parquet --parent-layer … --child-layer … -o <view>.parquet -f --upload`), then invalidate its CDN cache key. Do this last: the CDN serves the parquet to every environment reading the bucket, so upload it only once every environment's database has the columns.

No backend restart is needed: county data for the splits and Eguia metrics reloads itself when an evaluation asks for a new election. A correction to the values of an existing column shows in those metrics only after a restart.

**Verify**: a document created before the change shows the new columns in its district stats and its evaluation metrics.

## Batch onboarding

For repeatable multi-map setup (e.g. onboarding every state at once), use `batch-create-districtr-maps --config-file <yaml>` against a config matching `backend/management/configs/*` — it wraps steps 1, 2, 5, and 6 (not tileset or graph generation, which stay separate pipeline runs) and supports `--hidden` to force every created map to `visible=false` so a later `update-districtr-map` call is what launches them.
