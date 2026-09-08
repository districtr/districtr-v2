# Export Format Testing

Validating the backend's document export endpoint against schema and round-trip expectations. The export surface here is narrow and concrete — this file documents what actually exists rather than a generic export-testing checklist. Verified against the codebase as of 2026-08-27.

## Table of contents

- [The export surface](#the-export-surface)
- [What each format actually produces](#what-each-format-actually-produces)
- [Existing test coverage](#existing-test-coverage)
- [What to check for a new or changed export format](#what-to-check-for-a-new-or-changed-export-format)

## The export surface

One endpoint, one enum, four formats — `backend/app/exports/main.py` and `backend/app/exports/models.py`:

```
GET /api/document/{document_id}/export?export_type={type}
```

`DocumentExportType`:
- `BlockAssignmentsCSV` → `.csv`
- `DistrictsGeoJSON` → `.geojson`
- `DistrictsShapefile` → `.zip` (zipped ESRI Shapefile component set)
- `EvaluationJSON` → `.json`

An unrecognized `export_type` string returns `400` with the `ValueError` message from the `Enum` lookup — this is itself covered by an existing test (`test_get_unsupported_export_type` in `backend/tests/test_exports.py`).

## What each format actually produces

- **`BlockAssignmentsCSV`** (`build_block_assignments_csv`) — two columns, `geo_id,zone`, one row per assigned block. If the map has a `child_layer` (shatterable), rows are expanded through the contiguity graph (`get_graph(gerrydb_table_name)`): a parent assignment is expanded to one row per child via `G.nodes[geo_id]["children"]`, so every row in the export is always at the finest (block) granularity regardless of what the user actually painted at. This is why the export path depends on `learn-map-data`'s graph availability invariant — a missing graph pkl for a shatterable map breaks this export, not just contiguity checks.
- **`EvaluationJSON`** (`build_evaluation_json`) — delegates to `update_or_select_document_evaluation`; whatever that computes is written verbatim as JSON. Schema lives with the evaluation module, not the export code.
- **`DistrictsGeoJSON`** (`build_districts_geojson`) — hand-assembled (not `geopandas`/`shapely`-serialized) `FeatureCollection`: one Feature per zone with `id`/`properties.zone` set to the zone number and `geometry` taken directly from `DistrictUnionsResponse.geometry` (already a GeoJSON-shaped dict from the DB's `ST_AsGeoJSON`). Rows with a `None` zone or geometry are skipped.
- **`DistrictsShapefile`** (`build_districts_shapefile`) — builds a `GeoDataFrame` (`zone` column + geometry, `crs="EPSG:4326"`) from the same `DistrictUnionsResponse` rows, writes it with `gdf.to_file(..., driver="ESRI Shapefile")`, and zips the resulting `.shp`/`.shx`/`.dbf`/`.prj` component set. The `.prj` file is what a round-trip check should confirm is present and reads as EPSG:4326 — `to_file` writes it automatically from the GeoDataFrame's `crs`, but a regression here (e.g. someone drops the explicit `crs=` argument) would silently ship shapefiles with no CRS metadata.
- Both district-boundary formats (`DistrictsGeoJSON`, `DistrictsShapefile`) first call `update_or_select_district_stats` to refresh the district-union cache, and return a `422` if no zone has both a non-null zone and geometry — i.e. exporting boundaries before any zone is assigned is a handled error, not a crash.

## Existing test coverage

`backend/tests/test_exports.py` covers the CSV path (with and without a child layer) and the unsupported-type 400. Fixture files exist at `backend/tests/fixtures/exports/zone_assignments_csv_export.csv` and `.../zone_assignments_geojson_export.geojson` — check these before writing a new fixture; they may already cover the shape you're about to test. GeoJSON, Shapefile, and evaluation-JSON exports have no dedicated test as of 2026-08-27 — the code paths above are read from source, not confirmed against a passing test for those three formats.

## What to check for a new or changed export format

1. **Round-trip readability**: for GeoJSON, load the output with the library that will actually consume it downstream (`geopandas.read_file` or plain `json.load` + schema check) — not just "is it valid JSON." For Shapefile, unzip and load the `.shp` with `geopandas.read_file` or `ogrinfo`, and confirm the CRS reads back as EPSG:4326.
2. **Zone/None handling**: every export builder filters `row.zone is not None and row.geometry is not None` — confirm a new format does the same, or explicitly documents why it includes unassigned rows.
3. **Shatterable-map behavior**: if the new format touches per-block data (like `BlockAssignmentsCSV`), decide explicitly whether it expands through the graph to block granularity or reports at whatever granularity was actually assigned — the existing CSV format's block-expansion behavior is a deliberate choice, not a default to copy without checking it's still wanted.
4. **Empty/pre-assignment state**: confirm the new format either produces a sensible empty output or raises the same `422` pattern the two boundary formats use, rather than a raw 500 from an empty `GeoDataFrame` or empty union query.
5. **File cleanup**: exports write to `/tmp/{document_id}_{type}_{timestamp}.{ext}` and rely on `background_tasks.add_task(remove_file, _out_file)` for cleanup — a new format must register the same cleanup task, or exports leak files in `/tmp`.
