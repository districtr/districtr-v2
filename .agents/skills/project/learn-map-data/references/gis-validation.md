# GIS Data Validation

Pre-ingestion checks for GeoPackage/Shapefile sources before they reach
`import-gerrydb-view`, a tileset build, or graph generation. Every convention below is
grounded in code that already assumes it; this file exists so the assumption is
checked *before* a failure surfaces three steps downstream (a broken tileset, an empty
edge table, a "layer not found" frontend error). Verified against the codebase as of
2026-08-27.

## Table of contents

- [CRS: everything downstream expects EPSG:4326](#crs-everything-downstream-expects-epsg4326)
- [The `path` column is load-bearing](#the-path-column-is-load-bearing)
- [Layer naming: filename stem is the convention](#layer-naming-filename-stem-is-the-convention)
- [Geometry topology for coverage operations](#geometry-topology-for-coverage-operations)
- [Parent/child nesting for shatter and graph edges](#parentchild-nesting-for-shatter-and-graph-edges)
- [A pre-ingestion check sequence](#a-pre-ingestion-check-sequence)

## CRS: everything downstream expects EPSG:4326

Every place the pipelines toolchain reprojects data, it reprojects to `EPSG:4326`:
`ogr2ogr -t_srs EPSG:4326` in tileset and county-tile generation
(`pipelines/tilesets/cli.py`, `pipelines/tilesets/models.py`), `gdf.to_crs(epsg=4326)`
for point/centroid parquet output (`pipelines/tilesets/models.py`), and CRS-mismatch
reconciliation via `.to_crs(...)` in graph construction
(`pipelines/transforms/graph.py`) and demography aggregation
(`pipelines/transforms/models.py`). A source GeoPackage in a different CRS is not
rejected anywhere in this chain — it is silently reprojected at the first tool that
touches it, which means a genuinely wrong or missing CRS on the source file (rather
than merely "not 4326") won't be caught until the reprojected output looks wrong on a
map. Check the source CRS explicitly before ingestion:

```sh
ogrinfo -so my_layer.gpkg my_layer | grep -A2 "Layer SRS"
```

## The `path` column is load-bearing

`path` is not an ordinary attribute column. It is:
- Excluded from user-facing demographic columns during import
  (`backend/app/utils.py`'s numeric-column query excludes
  `geometry`/`geography`/`fid`/`path`).
- The default first entry in `DEFAULT_GERRYDB_COLUMNS`
  (`pipelines/core/constants.py`) — every tileset build expects it present.
- The feature ID MapLibre uses at render time (`promoteId="path"` — see
  `learn-map-frontend`'s layers-and-styling reference) and the join key used by
  `useLayerFilter`'s shatter filters and by graph construction's spatial join
  (`child_gdf[["path", "geometry"]]` in `pipelines/transforms/graph.py`).

A source layer missing `path`, or with non-unique `path` values, will import and tile
without error and then fail in a way that looks unrelated: ambiguous feature-state
writes, shatter filters that match the wrong features, or graph edges attached to the
wrong node. Check uniqueness before import:

```sh
ogrinfo -sql "SELECT path, COUNT(*) FROM my_layer GROUP BY path HAVING COUNT(*) > 1" my_layer.gpkg
```

## Layer naming: filename stem is the convention

`import-gerrydb-view` (`backend/management/load_data.py`) defaults `table_name` to the
layer name, and `pipelines/transforms/graph.py`'s `_gpkg_layer_name` documents the
underlying convention directly: "layer name == gpkg filename stem (enforced by ogr2ogr
import)." Existing batch configs (`backend/management/configs/*.yaml`) follow a
`{state}_{geography}_districtr_view` pattern for the gpkg filename, table name, and
layer name together (e.g. `ak_block_districtr_view.gpkg` /
`ak_block_districtr_view`). A GeoPackage whose internal layer name doesn't match its
filename stem will still import (the CLI's `--layer` flag is explicit), but any code
path that derives the layer name from the path instead of reading it explicitly
(`_gpkg_layer_name` is one) will silently pick the wrong layer. Confirm before import:

```sh
ogrinfo -so my_layer.gpkg   # lists layer names; compare against the filename stem
```

## Geometry topology for coverage operations

District-union rendering (`backend/app/utils.py`) tries `ST_CoverageUnion` first — a
linear-time dissolve that requires valid *coverage* topology (no overlaps, shared edges
identical between adjacent polygons) — and falls back to the slower `ST_UnaryUnion`
only if it errors. Source geometries with sliver overlaps or non-matching shared edges
between adjacent units don't break ingestion; they just push every district-boundary
render onto the slow fallback path, silently. Two checks worth running on a new source
layer:

```sh
# Self-intersections / invalid geometry (shapely, matches the app's own geometry stack)
python3 -c "
import geopandas as gpd
gdf = gpd.read_file('my_layer.gpkg')
invalid = gdf[~gdf.geometry.is_valid]
print(f'{len(invalid)} invalid geometries')
"

# Overlaps between adjacent units (expensive on large layers — sample first)
python3 -c "
import geopandas as gpd
gdf = gpd.read_file('my_layer.gpkg')
overlaps = gpd.overlay(gdf, gdf, how='intersection')
print(f'{len(overlaps) - len(gdf)} overlapping pairs (approx)')
"
```

## Parent/child nesting for shatter and graph edges

Both `create-parent-child-edges` (backend, live DB spatial join) and
`_annotate_graph_with_parents_from_gpkg` (pipelines, GeoPackage spatial join — built
explicitly to replace the DB query without a live DB, per its own docstring) use the
same method: representative point of the child geometry tested against parent
polygons. A child unit whose representative point falls outside every parent polygon
(a real possibility for oddly-shaped units, not just bad data) produces a silently
missing edge rather than an error. If parent/child nesting is close but not exact
(common when parent and child layers come from different vintages of the same source),
check coverage before relying on either spatial join:

```sh
python3 -c "
import geopandas as gpd
child = gpd.read_file('child.gpkg')
parent = gpd.read_file('parent.gpkg')
child_pts = child.copy()
child_pts['geometry'] = child.geometry.representative_point()
joined = gpd.sjoin(child_pts, parent, how='left', predicate='within')
print(f'{joined[\"index_right\"].isna().sum()} children with no parent match')
"
```

## A pre-ingestion check sequence

For a new source GeoPackage, in order (cheapest and most likely to catch a real
problem first):

1. `ogrinfo -so <file> <layer>` — confirm layer name matches the filename stem and CRS
   is EPSG:4326 (or a CRS `ogr2ogr` can cleanly reproject from).
2. Confirm `path` exists and is unique (query above).
3. Confirm geometries are valid (`is_valid`).
4. If the layer will be a coverage (block/VTD assignment source), spot-check for
   overlaps.
5. If the layer participates in shatter (has a paired parent or child layer), spot-check
   parent/child nesting coverage.

None of this is enforced by the ingestion CLIs themselves — they trust their input.
Running it up front is strictly cheaper than diagnosing which of the five silent
failure modes above produced a given downstream symptom.
