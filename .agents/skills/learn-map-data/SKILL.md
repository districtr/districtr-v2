---
name: learn-map-data
description: Map data pipeline and map onboarding — GeoPackage source data, GerryDB import, tileset / parquet / contiguity-graph pipeline outputs, the DistrictrMap record, parent-child (shatter) edges, and how the backend resolves them. Use when adding or debugging a map or module, editing the pipelines/ CLIs, changing backend management commands or configs, or investigating why a map fails to load, shatter, or pass a contiguity check.
user-invocable: false
---

# Map Data

A map module a user can open and edit is the join of a database record
(`DistrictrMap`) and a set of artifacts produced upstream by the pipelines toolchain
(tiles, tabular parquet, a contiguity graph). This skill covers that whole path: the
GerryDB import, the pipeline CLIs that produce consumable artifacts, the backend CLI
that wires them into a `DistrictrMap`, and the edge/graph linkage that shatter and
contiguity depend on. It merges what used to be two skills (lifecycle ordering,
pipeline contracts) because pipeline output shape and backend ingestion order are one
question in practice — a pipeline schema change and a backend ordering bug surface the
same way, as a map that won't load or shatter correctly.

## Grounded invariants

- **Onboarding order is fixed, and enforced by dependency, not convention**: base
  GerryDB layer(s) → shatterable view (if applicable) → `DistrictrMap` record →
  parent-child edges (if shatterable). This is the load order documented and enforced
  in `backend/management/load_data.py`'s `load_sample_data` (its own docstring states
  this exact ordering); each step reads state the previous step wrote — a `DistrictrMap`
  row references a `gerrydb_table_name`/`parent_layer`/`child_layer` that must already
  exist, and edges reference the `DistrictrMap` UUID.
- **Tileset/tabular/graph artifacts are pipeline outputs, produced before the backend
  ever runs.** `create-districtr-map` takes `--tiles-s3-path` as an input, not
  something it derives — the tileset must already exist in S3/R2. The contiguity graph
  is likewise built by `pipelines/transforms create-graph` (a networkx pickle) and
  only *read* by the backend (`app/evaluation/graph.py`), never generated there.
  Treating pipeline output shape as backend-internal is a category error that produces
  "works on old maps, breaks on new ones" bugs.
- **Parent-child edges require geometry-nesting consistency between the two GerryDB
  layers** — the edge table is a spatial join (representative point of each child
  within its parent), so a topology inconsistency between the layers silently produces
  a wrong or empty edge table rather than an error.
- **`districtr_map_slug`, `gerrydb_table_name`, `parent_layer`/`child_layer`, and the
  tiles path must stay consistent across the DB record, the pipeline output, and the
  frontend's map document contract.** The FE reads `parent_layer`/`child_layer` as
  literal PMTiles source-layer names (see `learn-map-frontend`'s layer-and-styling
  reference) — a mismatch here is a frontend "layer not found" bug with a backend root
  cause.
- **Contiguity endpoints require the graph to exist for the map's `gerrydb_table_name`
  and fail closed, not silently, when it doesn't** — `check-missing-graphs` exists as a
  standing CLI check precisely because a map can otherwise onboard successfully and
  only fail contiguity checks later.

## Territory map

### Backend CLI and data model
- `backend/cli.py` — `import-gerrydb-view`, `create-shatterable-districtr-view`,
  `create-districtr-map`, `update-districtr-map`, `create-parent-child-edges`,
  `delete-parent-child-edges`, `add-extent-to-districtr-map`, `batch-create-districtr-maps`,
  `create-spatial-index`, `check-missing-graphs`, plus overlay/map-group commands
- `backend/management/load_data.py` — `load_sample_data`, the documented/enforced
  onboarding order, and `Config`/`*ViewConfig` models for batch YAML/JSON configs
- `backend/management/configs/*` — real batch config examples (state-by-state
  gerrydb-view lists, per-map settings)
- `backend/app/utils.py` — `create_districtr_map`, `create_parent_child_edges`,
  `create_shatterable_gerrydb_view`, `add_extent_to_districtrmap` (the functions the
  CLI wraps)
- `backend/app/models.py` — `DistrictrMap`, `ParentChildEdges` (partitioned per map)
- `backend/app/evaluation/graph.py` — resolves and loads a map's contiguity graph
  (local path or `s3://.../graphs/{gerrydb_table_name}.pkl`), read-only from the
  backend's perspective
- `backend/app/contiguity/main.py` — contiguity/connected-components checks that
  consume the loaded graph

### Pipelines
- `pipelines/cli.py` — entry point (`tabular`, `tileset`, `transforms` command groups)
- `pipelines/tilesets/cli.py` — `create-gerrydb-tileset`, `merge-gerrydb-tilesets`,
  `batch-create`, `create-county-tiles` (ogr2ogr/tippecanoe under the hood)
- `pipelines/tabular/cli.py` — `build-parquet`, `batch-build-parquet`
- `pipelines/transforms/cli.py` — `aggregate`, `create-graph`, `batch-create-graphs`
  (the graph the backend later reads)
- `pipelines/transforms/graph.py` — graph construction from GeoPackage edge layers /
  spatial join between parent and child GeoPackages
- `pipelines/core/settings.py` — S3/R2 credentials and bucket configuration shared by
  all pipeline CLIs

## Causal history

- No single PR fully reworked this path recently; the load-order invariant above is
  taken directly from the enforcing code's own docstring (`load_data.py`,
  `load_sample_data`) rather than from a changelog, since that docstring states the
  order as a requirement ("The order of adding views MUST be...") and the function
  body depends on it (each stage's existence check assumes the prior stage ran).
- The graph-generation split (pipelines build it, backend only reads it) is visible in
  `pipelines/transforms/graph.py`'s own module docstring: "Graph building pipeline —
  produces dual-level pkl graphs without DB access," explicitly built to avoid a live
  DB dependency during graph construction, and `_annotate_graph_with_parents_from_gpkg`
  is documented as replacing "the parentchildedges DB query" with a GeoPackage spatial
  join — the pipeline computes what the backend used to compute live.

## References

- [references/gis-validation.md](references/gis-validation.md) — pre-ingestion
  GeoPackage/Shapefile validation: geometry topology, CRS consistency, layer naming
  conventions this repo actually relies on.
- [references/export-testing.md](references/export-testing.md) — validating the
  backend's document export formats (CSV/GeoJSON/Shapefile/evaluation JSON) against
  schema and round-trip expectations.

## See also

- [learn-map-frontend](../learn-map-frontend/SKILL.md) — how `parent_layer`/
  `child_layer`, the tileset, and shatter state get consumed at render time.
- [learn-backend](../learn-backend/SKILL.md) — general FastAPI/SQLModel conventions
  this CLI and its endpoints follow.
