# Spike: single-row jsonb assignments + incremental saves

**Question.** Should we store a document's assignments as one `jsonb` row
(`{geo_id: zone}`) instead of one `document.assignments` row per unit, and change
`PUT /api/assignments` from DELETE + COPY of the whole plan to applying only the
units that changed?

**Answer: do the incremental saves, but keep the relational table.** Nearly all of
the speed-up comes from incremental writes, not from jsonb. An incremental
upsert into the existing table saves in 1–3 ms for up to 100 changed units, at any
plan size, and leaves almost no garbage. In Postgres, updating a jsonb value
always rewrites and recompresses the whole blob. A jsonb save therefore costs time
in proportion to plan size (50–70 ms for KS 52k, 200–300 ms for 200k units), and
each save leaves a full dead copy of the blob behind. jsonb's real win is storage
(about 30× smaller). That only matters if storage is a cost problem, and prod
size decides that (see Open questions).

Status: **implemented with jsonb** (the team chose the storage savings), together with delta saves and hash-checked saves. See [ADR 0068](../../docs/adr/0068-jsonb-assignments-delta-saves.md).

## Headline numbers

KS 52k-unit plan, 100 units changed per save (a typical 30 s–3 min autosave
window; `AUTOSAVE_DEBOUNCE_MS` / `AUTOSAVE_MAX_WAIT_MS`):

| | current (delete + copy all) | relational delta | jsonb full replace | jsonb delta (pglz) | jsonb delta (lz4) |
|---|---|---|---|---|---|
| save latency p50 | 374 ms | **2.9 ms** | 130 ms | 69 ms | 50 ms |
| WAL per save (warm) | 12.4 MB | **24 KB** | 222 KB | 227 KB | 320 KB |
| WAL per save (after checkpoint) | 20.6 MB | 865 KB | **441 KB** | 453 KB | 643 KB |
| on-disk garbage per save until vacuum | 3.6 MB | **7 KB** | 212 KB | 217 KB | 305 KB |
| stored size of this plan | 7.4 MB | 7.4 MB | **200 KB** | **200 KB** | 285 KB |

The current path also uploads the whole plan and then downloads it again to
check the save (`putUpdateAssignmentsAndVerify` → `getAssignments`). That GET
alone is **1.7 MB / 350 ms** for KS 52k locally, more than any database-side
cost above. A delta design should drop it (see Draw mode).

Full tables: [results/tables.md](results/tables.md). Raw output:
`results/*.json`.

## What was measured

- **Data:** a copy of every local plan (646 docs, 645k rows), plus a synthetic
  200k-unit TX block plan as an upper bound. Test plans: OR 1k, CO 8k, TX 23k,
  KS 52k (shattered), TX 200k.
- **Strategies** (`bench_writes.py`), each computing the dirty zones that
  `district_unions` invalidation needs, as the endpoint does today:
  - `rel_full`: the current endpoint (snapshot temp table, DELETE, COPY, INSERT, diff query).
  - `rel_delta`: one statement, `INSERT … ON CONFLICT DO UPDATE` of the changed
    units. Old zones are read in the same snapshot.
  - `js_full`: replace the blob, then diff old and new with `jsonb_each_text`.
  - `js_delta` / `js_lz4_delta`: `assignments - removed || changed`, with pglz or lz4 TOAST compression.
- **Per save:** client wall clock including JSON encode/parse of the request body,
  WAL bytes (`pg_current_wal_insert_lsn` diff), and on-disk growth with autovacuum
  off (starting from `VACUUM FULL`). Warm = steady state. After checkpoint = each
  save follows a `CHECKPOINT`, so first-touched pages pay full-page images. That
  matches real autosaves, which are minutes apart.
- **Reads** (`bench_joins.py`, dev DB, temp tables only): whole-plan load into
  Python, and joins against the real gerrydb geometry tables.
- Environment: local Docker Postgres 15.4 on a Mac, one client, no concurrency.
  Absolute numbers will differ on RDS, but the ratios should hold.

## Findings

1. **Incremental writes are the win, and they work on the relational table.**
   `rel_delta` takes about 1 ms for 1–10 changes and about 3 ms for 100, flat
   across plan sizes from 1k to 200k units. That is 20–400× faster than today
   for plans of 8k–200k units, and WAL drops from MB to KB. It only loses to
   jsonb on 10,000-unit bulk repaints of mid-sized plans (133 ms vs 73 ms on
   TX 23k).
2. **jsonb writes cost time in proportion to plan size, whatever the delta.**
   Every update detoasts, rebuilds and recompresses the whole object, writes it to
   WAL, and leaves the old copy dead. A one-unit change to KS costs 37–56 ms and
   about 215 KB of garbage. A jsonb delta is only about 2× better than a jsonb
   full replace, because the change is just the request payload.
3. **jsonb is about 30× smaller at rest.** 91 MB → 3.0 MB for all local plans
   (pglz). Most of the relational cost is the `(document_id, geo_id)` index
   (49 MB) and per-row tuple headers. pglz blobs are 30% smaller than lz4; lz4
   writes are 30% faster. Grouping as `{zone: [geo_ids]}` saves only 4%, because
   compression already removes the repeated zone values.
4. **Whole-plan reads are the same.** Loading KS 52k into Python takes 18 ms
   either way. Aggregating in SQL is slower on jsonb: `DISTINCT zone` takes
   34 ms vs 9 ms.
5. **Geometry joins are the same, and the union dominates anyway.**
   `jsonb_each_text` estimates 100 rows, so the planner picked nested-loop index
   probes in every test. At these sizes that ties or beats the relational merge/hash
   joins. The union for one zone takes 0.85–5.6 s on both.
6. **Watch out for the generic-plan cliff.** psycopg auto-prepares a statement
   after 5 runs. Postgres then switches to a generic plan that estimates 10 rows
   for `unnest($1)`, so it nested-loops the CTEs. The first `rel_delta` run went
   quadratic: 85 ms at 1,000 changes, **8.1 s at 10,000**
   ([results/run1_generic_plan_cliff.log](results/run1_generic_plan_cliff.log)).
   The jsonb delta has the same problem (`jsonb_each_text × delta`). The app's
   engine uses psycopg's default `prepare_threshold`, so production would hit it.
   Fix: run the statement unprepared (`prepare=False` /
   `SET LOCAL plan_cache_mode = force_custom_plan`; this is what the final run
   used). Or compute the diff in Python from `geo_id = ANY($keys)`, an index
   probe that doesn't depend on the plan (not benchmarked).

## Evaluation and view modes

The app has four modes (`ModeSwitcher`): draw, superdraw, display
(`/map/[public_id]`) and evaluate (`/map/[public_id]/eval`).

- **Draw / superdraw (writes).** This is the only mode that changes.
  - *Delta protocol.* The client keeps the last-saved `Map` and diffs it at save
    time (O(N) in the browser, a few ms). It sends `{set: [[geo_id, zone]…],
    remove: [geo_id…]}`. Shatter becomes set-children plus remove-parent, with no
    special case.
  - *Concurrency.* The existing `updated_at` check already guarantees the delta's
    base matches the server; a 409 falls back to today's conflict flow.
    `overwrite=true` and "use local" keep sending the full set, so the
    full-replace path stays. So do create, upload and duplicate.
  - *Cache invalidation.* Dirty zones fall straight out of the delta: old zone ∪
    new zone of the changed units. That replaces the snapshot temp table and the
    full diff query.
  - *Post-save verify.* The full GET should become a cheap check (the server
    returns a row count, or echoes the zones of the delta keys). Otherwise every
    save still moves the whole plan once.
- **Display.** Reads the whole plan via `get_assignments`. Same cost in both
  designs, so nothing changes. Under jsonb it's one row fetch plus `json.loads`.
  `parent_path` still comes from the graph.
- **Evaluate.** `EvaluationContext.zone_assignments` loads the whole plan into
  Python dicts (same cost), and every metric downstream is Python. `/stats` is
  dominated by the per-zone union rebuild. Incremental saves keep invalidating
  only the dirty zones, so evaluation cost doesn't change in either design.
- **What jsonb would force us to port:** about 10 SQL sites that read
  `document.assignments`:
  - `get_zone_assignments_geo` (the unions rebuild)
  - contiguity (3 queries)
  - the `DISTINCT zone` check in `update_or_select_district_stats`
  - thumbnails
  - the unassigned-units query
  - exports, `get_assignments` and the evaluation context
  - the `EXISTS` in `stats_refresh`
  - the duplicate/reset/clone writers

  A `jsonb_each_text` view would make most of these a rename. The cost is that
  the planner can't see real row counts.

## Recommendation

1. Add a delta mode to `PUT /api/assignments` on the existing table. Use the
   Python-side diff so the plan doesn't matter, and keep full replace for
   overwrite, create and upload. Drop the full post-save GET in favour of a
   cheap check.
2. Optional: `ALTER TABLE document.assignments SET (fillfactor = 90)` so zone
   updates can be HOT (zone isn't indexed). Not measured here.
3. Revisit jsonb only if prod storage is a real cost. If it is, a cold-storage
   format fits better than a live one: compact plans that haven't been edited in
   N days into a jsonb blob, and expand them on first edit.

## Alternative blob: binary-ensemble (BEN)

[BEN](https://github.com/peterrrock2/binary-ensemble) stores a plan as a
run-length-encoded, bit-packed vector over a fixed node order. Here each plan
was expanded to every block in the state, in GEOID order
(`export_vectors.py`), and encoded with the PyPI package (`bench_ben.py`,
[results/ben.jsonl](results/ben.jsonl)):

| plan | blocks in vector | runs | BEN | XBEN | numpy RLE + zlib | jsonb pglz | relational |
|---|---|---|---|---|---|---|---|
| CO 8k | 140,345 | 725 | 1.6 KB | 0.9 KB | 1.0 KB | 32 KB | 1.2 MB |
| TX 23k | 668,757 | 3,796 | 9.3 KB | 3.9 KB | 5.4 KB | 89 KB | 3.2 MB |
| KS 52k | 172,529 | 5,194 | 10.2 KB | 2.8 KB | 3.9 KB | 200 KB | 7.4 MB |

BEN encodes in 1–5 ms and decodes in 0.7–3 ms; XBEN takes 11–15 ms to encode
and 8 ms to decode.

**Pros**
- **Smallest by far:** 20–70× smaller than jsonb, and about 700× smaller than
  relational for KS.
- **Rewriting the whole plan on each save is cheap** because the blob is about
  10 KB. Expected WAL and garbage per save are about 10 KB (inferred from blob
  size, not measured). That beats jsonb on every metric and the relational delta
  after a checkpoint.
- **Interop:** plans become readable by GerryChain-side ensemble tooling.
  BEN's TwoDelta variant could also store a plan's version history cheaply.

**Cons**
- **Node order is the contract.** The vector means nothing without the exact
  block list, and the format can't detect a mismatch. If a map's block layer is
  re-onboarded, every saved plan decodes into plausible but wrong plans. Every
  map would need a frozen, versioned node order kept for as long as its plans
  exist. Today's geo_id keys describe themselves.
- **It loses shatter state.** A block vector can't tell "parent assigned whole"
  from "shattered, every child in the same district", or "shattered, children
  unassigned" from "parent unassigned". Decoding has to merge those back into
  parents, which changes the shatter contract. Keeping it would need a second
  vector (parents with a "shattered" marker, plus children of shattered parents).
- **Postgres can't read it.** Every SQL consumer (unions rebuild, contiguity,
  thumbnails, unassigned units, district list check, `stats_refresh`) has to
  decode in Python and send arrays to SQL. You also can't inspect a plan in psql.
- **Saves move into the app.** Each save becomes a decode–patch–encode round
  trip in Python under a row lock. Decoding also produces block-level vectors
  (668k entries for TX, even for a VTD plan) that have to be merged back into
  parents. That merge wasn't measured.
- **The dependency adds little.** It's a young Rust-wheel package with a
  file-path-only API, so every encode and decode needs a temp file. Its main
  strength is LZMA across many plans in an ensemble, which doesn't apply to one
  plan. About 10 lines of numpy RLE + zlib land within 1.4× of XBEN.

**Verdict:** BEN beats jsonb as a blob format. But all three blob designs share
the same big cost: porting every SQL reader, plus versioned node orders and the
shatter problem. That's a much larger change than delta saves on the existing
table. If storage ever forces a blob, this is the better cold-storage format for
idle plans.

## Open questions

- Prod size of `document.assignments` (table + index) and the distribution of
  plan sizes. Local data is skewed small (median 9 rows, p99 8k). Storage only
  justifies jsonb if prod is large.
- The real number of units changed per autosave. Logging `len(delta)` once delta
  saves ship would confirm that the 10–1,000 range assumed here is right.

## Reproduce

```bash
docker exec -i backend python - < prototypes/jsonb-assignments/bench_writes.py > writes.json  # ~20 min; creates/drops DB districtr_bench
docker exec -i backend python - < prototypes/jsonb-assignments/bench_joins.py > joins.json    # read-only on districtr (temp tables)
python3 prototypes/jsonb-assignments/summarize.py writes.json joins.json
docker exec -i -w /districtr-backend backend python - < prototypes/jsonb-assignments/export_vectors.py > vectors.jsonl
uv run --no-project --with binary-ensemble --with numpy python prototypes/jsonb-assignments/bench_ben.py vectors.jsonl
```
