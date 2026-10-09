# Topology parquet prototype

Prototype of the plan "Client-side topology for VTD and block painting" (phases 0–3), behind a
runtime flag, benchmarked against the current loader on TX v2 (`tx_districtr_view_v2`).

Status: in progress. Results go in the "Results" section at the bottom.

## Reconciliation with the code (2026-10-09)

- **Preconditions hold for TX v2.** VTDs are exact, vertex-identical unions of blocks (both layers
  are valid coverages). IDs are the `path` strings used as `promoteId` (`vtd:`-prefixed VTDs,
  including `-datadem-N` splits; 15-digit blocks). Adjacency in the graph is pure rook. Every
  coordinate is on the 1e-6° grid, so int32 at 1e-6 is lossless.
- **Source data:** `data/gerrydb/tx_districtr_{vtd,block}_view_v2.gpkg` (EPSG:4269, geometry
  column `geography`). Crosswalk = spatial join (as in `pipelines/tabular/models.py`).
- **What the topology replaces:**
  - The long-format tabular parquet (`tabular/{gerrydb_table}.parquet`, 29M rows): for 167
    shattered parents it decodes 2.4M rows / 25 MB and pivots in JS.
  - The points parquets (`tilesets/{layer}_points.parquet`), which do four jobs: brush coverage
    of unrendered units (invisible circle layers in `queryRenderedFeatures`), zone labels
    (GeometryWorker median point), unassigned bboxes, and zoom-to-ids.
  - `queryRenderedFeatures` in `getFeaturesInBbox`.
- **Not replaced:** PMTiles fills, `GET /api/gerrydb/edges` (it stays the source of truth for
  child ids on shatter), backend metrics, export.
- **Plan's open questions, answered:**
  - Reader: hyparquet 1.12 reads whole column chunks of a row group (no page index), so the row
    group is the unit of over-read for range reads.
  - MapLibre 4.7.1 has `GeoJSONSource.updateData(diff)`.
  - Contiguity is rook, with no manual edges in the TX graph.
  - Parents are exact unions of blocks for TX v2. Other maps are unchecked.

## Flag

`localStorage.districtr_topology = 'full' | 'simplified'` turns the prototype on (read once at
page load); unset means current code. Files load from
`${NEXT_PUBLIC_TOPOLOGY_URL ?? PARQUET_URL}/topology/{variant}/{gerrydb_table}/{file}.parquet`.

## Files (one set per map and variant)

Coordinates are lon/lat × 1e6 as int32. Arc vertices are delta-encoded within each arc: the first
vertex is absolute, the rest are differences. bboxes are int32 at the same scale. Unit ids are row
indexes: parents `0..P-1`, children `P + child_row`. Arc ids: exterior `0..E-1`, interior
`E + interior_row`. Ring refs: `i` = arc i forward, `~i` (= -i-1) = arc i reversed. Outer rings
are counter-clockwise in lon/lat; holes are clockwise.

```
parents.parquet        all loaded at start; Hilbert-sorted (row = parent idx)
  path, <demography columns>, area_m2, label_x, label_y, xmin, ymin, xmax, ymax,
  rings list<list<int32>>,                  -- exterior arc refs only
  child_row_start, child_row_count,         -- range into children.parquet
  interior_row_start, interior_row_count    -- range into arcs_interior.parquet

children.parquet       range reads per shattered parent; grouped by parent in parent order
  path, parent_idx, <demography columns>, area_m2, label_x, label_y, xmin, ymin, xmax, ymax,
  rings list<list<int32>>                   -- exterior and interior arc refs

arcs_exterior.parquet  all loaded at start; arcs between different parents or on the outline
  xs list<int32>, ys list<int32>,
  a_parent, b_parent, a_child, b_child,     -- parent idx / child row, -1 = outside
  length_m, xmin, ymin, xmax, ymax

arcs_interior.parquet  range reads per shattered parent; arcs between blocks of one parent
  parent_idx, xs, ys, a_child, b_child, length_m, xmin, ymin, xmax, ymax
```

The `a` side is the unit whose ring uses the arc forward (to its left in lon/lat), `b` the one
that uses it reversed. `area_m2` and `length_m` are geodesic (pyproj Geod, WGS84) from
full-resolution coordinates, in both variants. `label_x/label_y` = `point_on_surface`.
Demography columns are the tabular parquet's `column_name` set, minus `index_right`.

Variants: `full` (the plan as written) and `simplified` (each arc Douglas–Peucker'd with its
endpoints fixed, tolerance ≈ one z12 tile unit, 2e-5°).

## In-memory shape on the client

See `app/src/app/utils/topology/types.ts`. Coordinates are MapLibre `MercatorCoordinate`
units (0..1). Selection and boundaries read only those types.

## Benchmark

Local dev DB doc with public_id 280 (tx_custom_districts_v2): 5,631 VTD rows and 13,690 block rows
across 167 shattered parents. Baseline unshattered doc: public_id 199. All data (current parquet,
PMTiles, topology files) is served from one local range server, unthrottled and with CDP
throttling. Perf marks: see `app/e2e/bench/`.

## Results

(pending)
