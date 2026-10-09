# Topology parquet prototype

Prototype of the plan "Client-side topology for VTD and block painting" (phases 0–3), behind a
runtime flag, benchmarked against the current loader on TX v2 (`tx_districtr_view_v2`).

Status: prototype complete (2026-10-09). Local only, never pushed. Results are at the bottom.

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

`localStorage.districtr_topology = <variant>` (`full`, `simplified` or `coarse`) turns the
prototype on (read once at page load); unset means current code. Files load from
`${NEXT_PUBLIC_TOPOLOGY_URL ?? PARQUET_URL}/topology/{variant}/{gerrydb_table}/{file}.parquet`.

## Files (one set per map and variant, as built)

Built by `pipelines/topology/build.py` (exact-grid numpy topology; mapshaper gave identical arcs
in the spike) and verified by `pipelines/topology/check.py`. Coordinates are lon/lat × 1e6 as
int32. Unit ids are row indexes: parents `0..P-1`, children `P + child_row`. Arc ids: exterior
`0..E-1`, interior `E + interior_row`. Ring refs: `i` = arc i forward, `~i` (= -i-1) = arc i
reversed. Rings are listed polygon by polygon: a CCW ring (lon/lat) starts a polygon, the CW
rings after it are its holes. zstd, no column statistics, no dictionary encoding.

```
parents.parquet            whole file at start; Hilbert-sorted (row = parent idx); 1 row group
  path, <42 demography int32>, area_m2 f32, label_x, label_y,
  rings list<list<int32>>,                  -- exterior arc refs only
  child_row_start, child_row_count,         -- range into children.parquet
  interior_row_start, interior_row_count    -- range into arcs_interior_blob.parquet

children.parquet           range reads per shattered parent; grouped by parent in parent order;
                           ~1,000 rows per row group, whole parents per row group
  path, parent_idx, <42 demography int32>, area_m2 f32, label_x, label_y,
  rings list<list<int32>>                   -- exterior and interior arc refs

arcs_exterior_blob.parquet whole file after demography; arcs between different parents or on
                           the outline; 1 row group
  xy binary,                                -- LE int32 [x0, y0, dx1, dy1, ...]
  a_parent, b_parent, a_child, b_child,     -- parent idx / child row; outline arcs: b = -1
  length_m f32

arcs_interior_blob.parquet range reads per shattered parent; arcs between blocks of one parent;
                           ~1,000 rows per row group (cut independently of children.parquet)
  parent_idx, xy binary, a_child, b_child, length_m f32
```

The `a` side is the unit whose ring uses the arc forward, `b` the one that uses it reversed.
`area_m2` and `length_m` are geodesic (pyproj Geod, WGS84) from full-resolution coordinates in
every variant. `label_x/label_y` = `point_on_surface`. Demography columns are the tabular
parquet's `column_name` set minus `index_right`. bboxes are computed on the client.

Variants: `full` (lossless); `simplified` and `coarse` Douglas–Peucker each arc with its
endpoints fixed at 2e-5° (about one z12 tile unit) and 1e-4°. An arc is kept at full resolution
if simplifying it would collapse or flip a ring (7 arcs in simplified, 408 in coarse). Arcs are
simplified independently, so neighbours can cross: 33 blocks are invalid in simplified, and
1,518 blocks plus 27 VTDs in coarse.

## In-memory shape on the client

See `app/src/app/utils/topology/types.ts`. Coordinates are MapLibre `MercatorCoordinate`
units (0..1). Selection and boundaries read only those types.

## Benchmark

Local dev DB doc with public_id 280 (tx_custom_districts_v2): 5,631 VTD rows and 13,690 block rows
across 167 shattered parents. Baseline unshattered doc: public_id 199. All data (current parquet,
PMTiles, topology files) is served from one local range server, unthrottled and with CDP
throttling. Perf marks: see `app/e2e/bench/`.

## Results

Prod build, headless Chrome 154 on an M5 Pro, viewport 1400×900. Every file (tabular, points,
PMTiles, topology) comes from one local HTTP/1.1 range server. The API goes through a
read-only proxy. `throttled` is CDP throttling: 40 ms latency, 5 MB/s down. Each cell is the
median of 5 runs after a warm-up, with p90 within a few percent of it. "current" is the same
build with the flag off.

Metrics:
- **Bars:** the first demography-ready that includes every shattered parent (the sidebar bars
  are complete).
- **Ready:** the brush covers every unit, rendered or not. For the current path that is when
  the point files have loaded and the map is idle; for the topology path it is when the arcs
  have loaded.
- **MB:** bytes over the wire for tabular + points + topology files. PMTiles adds about 3.9 MB
  and is the same on both paths.
- **Renderer:** memory and CPU seconds of the renderer process, workers included.

### Doc 280: 167 shattered VTDs (13,690 blocks)

| | current | full | simplified | coarse |
|---|---|---|---|---|
| Bars, unthrottled | 3.28 s | 0.89 s | 0.89 s | 0.88 s |
| Ready, unthrottled | 3.95 s | 1.38 s | 1.34 s | 1.24 s |
| Bars, throttled | 8.05 s | 3.39 s | 3.41 s | 3.40 s |
| Ready, throttled | 10.74 s | 7.65 s | 6.57 s | 5.99 s |
| MB fetched | 17.0 | 26.9 | 21.9 | 19.2 |
| Renderer memory | 1.90 GB | 0.87 GB | 0.81 GB | 0.72 GB |
| Renderer CPU | 9.0 s | 4.6 s | 4.5 s | 4.3 s |
| Shatter one more VTD (bars / idle) | 3.29 / 3.42 s | 0.28 / 1.13 s | 0.29 / 1.14 s | 0.29 / 1.14 s |
| Brush event p50 / p95 (50 px, state zoom) | 0.3 / 4.5 ms | 0.1 / 1.8 ms | 0.1 / 1.6 ms | 0.1 / 1.3 ms |

### Doc 199: no shattered VTDs

| | current | full | simplified | coarse |
|---|---|---|---|---|
| Bars, unthrottled | 0.52 s | 0.41 s | 0.41 s | 0.40 s |
| Ready, unthrottled | 0.81 s | 0.98 s | 0.96 s | 0.94 s |
| Bars, throttled | 2.73 s | 1.65 s | 1.57 s | 1.62 s |
| Ready, throttled | 3.38 s | 4.38 s | 3.62 s | 3.23 s |
| MB fetched | 2.2 | 13.7 | 10.2 | 8.3 |
| First shatter, throttled (bars) | 0.60 s | 0.81 s | 0.81 s | 0.80 s |

### What changed between rounds

Round 1 followed the plan as written:
- Everything loaded at start.
- Footers were fetched eagerly.
- Arcs were stored as `list<int32>` with stored bboxes and float64 lengths.

Its throttled numbers were worse than the current code: doc 280 bars 9.18 s, doc 199 ready 6.41 s.
Three changes produced the tables above:

1. **Demography first.** The loader reads `parents.parquet`, then only the demography columns
   of the shattered parents' children. Arcs start loading after that. Until the arcs land, the
   brush falls back to `queryRenderedFeatures`.
2. **Footers on first use.** The children and interior footers (2.1 MB) load at the first
   shatter, so documents with nothing shattered never fetch them.
3. **Compact schema.** Coordinates are stored as blobs, which decode about 30% faster than the
   lists. Bbox columns are dropped (the client recomputes them), lengths and areas are float32,
   and the `coarse` variant is added. Together that is about 7 MB less per variant.

### Correctness

- **Pipeline (`check.py`, all variants):**
  - Each arc is used exactly once per side.
  - The full variant rebuilds all 668,757 blocks and 9,068 VTDs exactly.
  - Adjacency from arc sides equals the GerryDB rook graph.
  - Children sum to their parent for area and all 42 demography columns.
- **Selection:** compared with shapely `dwithin` on Travis County (1,000 disks and 250 capsules):
  - full: 0 mismatches
  - simplified: 8 of 9,173 hits differ, all within the simplification tolerance
  - The synthetic-grid tests also pass.
- **Browser (`app/e2e/bench/verify.ts`, every variant):**
  - The demography table has 22,591 rows, the same as the current path.
  - Doc 280 starts with 12,401 boundary arcs.
  - A real mouse stroke paints shattered blocks, feature-state matches the store, and the
    boundary diff updates.
- **Selection micro-bench (bun, full TX, doc 280's shatter set):**
  - Brush event: p95 0.02–0.09 ms for typical brushes; 1.2 ms worst case (100 px capsule at z9).
  - Index rebuild after a shatter: 2.4 ms.
  - Boundary recompute plus diff after a 200-unit stroke: 3.5 ms.

### Findings

- **The topology wins on CPU, memory and every interaction.**
  - Bars appear 2.4–3.7× sooner on doc 280.
  - The renderer uses about 55% less memory and half the CPU.
  - Shattering one more VTD drops from 3.3 s to 0.3 s.
  - The current path's cost is decoding and pivoting 2.4M long-format rows in the worker
    (about 2.6 s), plus re-reading the tabular file on every shatter.
- **Bytes are the topology's weak spot.** On a slow link, documents with nothing shattered pay
  for the arcs before the brush is ready. On doc 199 throttled, only `coarse` matches the
  current path (3.23 vs 3.38 s); `full` is 1 s slower. The bars are faster in every variant.
- **Coordinates are no longer most of the bytes.** In `children.parquet` the 42 demography
  columns are 55%. Packing them into one binary column would shrink the 1.7 MB footer about 5×
  and make smaller row groups affordable; 97 of 669 row groups are read for doc 280.
- **`coarse` (1e-4°, about 11 m)** is about one pixel at z13 and fine at the zooms where VTDs are
  painted. Its 1,518 self-intersecting blocks don't affect selection or boundaries, but they would
  matter for export (phase 5). Per-zoom simplification, or validity-preserving coverage
  simplification (`shapely.coverage_simplify`), would fix that.

### Bugs found in the current code (not fixed here; flag-off is unchanged)

- **Block points file read whole.** `getRowGroupsFromChildValue` reads the entire 10.8 MB file;
  5.6 MB is needed for doc 280. That puts it on the critical path when throttled.
- **`prefetch` ignores its cache** (`parquetWorkerUtils.ts`). Every shatter re-downloads the
  ranges.
- **Concurrent footer reads.** Two concurrent `getMetaData` calls fetch the tabular footer
  twice. In about 1 of every 10–15 local loads, Chrome's HTTP cache serves a partial entry, the
  load fails with `parquet file invalid (footer != PAR1)` and stays on "Loading population
  data…".
- **Console errors on load.** 167 `source 'blocks' does not exist` errors per load, from
  `setFeatureState` running before the source exists.

### Known gaps

- **Brush shape.** The brush is a disk, where the current one is a square, and it assumes the
  map is north-up with no pitch.
- **Before arcs land.** Between bars and ready, painting only reaches rendered units.
- **COI mode** goes through the same paint function but is untested.
- **Phases 4–5** (client metrics, contiguity, export) were not built.
- **Other maps.** Only TX v2 is built and checked.
- **Build memory.** The full TX build peaks at about 15 GB of RSS, all in memory.

### Reproduce

```
# data (about 50 s, ~15 GB RSS), from the main checkout
backend/.venv/bin/python <wt>/pipelines/topology/build.py data/gerrydb/tx_districtr_vtd_view_v2.gpkg \
  data/gerrydb/tx_districtr_block_view_v2.gpkg tmp/topology-bench/www/topology tx_districtr_view_v2
# app/ in the worktree
e2e/bench/stack.sh servers && e2e/bench/stack.sh build && e2e/bench/stack.sh start
node e2e/bench/verify.ts --doc 280 --variant coarse
node e2e/bench/bench.ts --docs 280,199 --runs 5 --warmup 1 --variant coarse --network none,throttled
e2e/bench/stack.sh stop
```

Raw per-run JSON is in `tmp/topology-bench/results/`, with tags `baseline`, `proto` (round 1)
and `round2`.
