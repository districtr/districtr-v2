/**
 * Worker-side loader for the topology-parquet prototype (prototypes/topology-parquet/README.md).
 * Plain functions over an IO adapter so bun can run them against local files.
 *
 * Load order, so demography never waits on (or shares bandwidth with) geometry:
 *   loadParents: parents.parquet in one GET.
 *   loadChildren 'demography' / 'labels': those column groups of children.parquet for some
 *     parents (the children footer is read on first use).
 *   loadArcs: arcs_exterior_blob.parquet in one GET.
 *   loadChunks: children rings + arcs_interior_blob rows (that footer is read on first use).
 * Bboxes are not stored: arcs' come from their decoded vertices, units' from their rings' arcs.
 */
import {AsyncBuffer, FileMetaData, parquetMetadata, parquetRead} from 'hyparquet';
import {compressors} from 'hyparquet-compressors';
import type {AllTabularColumns} from '../api/summaryStats';
import {
  Columns,
  LABEL_COLUMNS,
  decodeArcs,
  decodeParents,
  decodeRings,
  degrees,
  demographyColumns,
  floats,
  mercatorPoints,
  unitBboxes,
} from '../topology/decode';
import type {ArcChunk, ParentChunk, ShatterChunk} from '../topology/types';
import type {ColumnarTableData, MetaInfo} from './parquetWorker.types';
import {EnhancedAsyncBuffer, mergeByteRanges} from './parquetWorkerUtils';

export interface TopologyIO {
  /** A whole file, fetched in one request. */
  whole: (url: string) => Promise<ArrayBuffer>;
  /** A file read by row group (HEAD + footer; prefetch when the buffer supports it). */
  ranged: (url: string) => Promise<MetaInfo>;
}

export interface TopologyBase {
  P: number;
  B: number;
  E: number;
  parents: ParentChunk;
  exterior: ArcChunk;
}

export type ChildGroup = 'demography' | 'labels';

type Demography = Record<string, Float64Array>;
type Labels = {lon: Float64Array; lat: Float64Array; areaM2: Float64Array};

/** What the worker keeps per map. */
export interface TopologyState {
  io: TopologyIO;
  base: string;
  P: number;
  B: number;
  /** Copy of the exterior arc bboxes (the arcs go to the main thread), for children bboxes. */
  exteriorBbox?: Float64Array;
  /** Decoded parents, held until loadArcs hands them to the main thread. */
  parents: ParentChunk | null;
  parentIdx: Map<string, number>;
  parentPaths: string[];
  parentLabels: Labels;
  childRowStart: Uint32Array;
  childRowCount: Uint32Array;
  interiorRowStart: Uint32Array;
  interiorRowCount: Uint32Array;
  columns: string[];
  parentDemography: Demography;
  /** Per loaded parent: its children's demography group, and label group. */
  children: Map<number, {paths: string[]; demography: Demography}>;
  labels: Map<number, Labels>;
  /** Group loads in flight, by `${group}:${parent}`. */
  pending: Map<string, Promise<void>>;
  childrenFile?: Promise<MetaInfo>;
  interiorFile?: Promise<MetaInfo>;
}

const fileUrl = (base: string, name: string) => `${base}/${name}.parquet`;

export const fetchWhole = async (url: string) => {
  const res = await fetch(url, {mode: 'cors', credentials: 'omit'});
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.arrayBuffer();
};

const concat = (parts: ArrayLike<unknown>[]): ArrayLike<unknown> => {
  if (parts.length === 1) return parts[0];
  const out: unknown[] = [];
  for (const p of parts) for (let i = 0; i < p.length; i++) out.push(p[i]);
  return out;
};

/**
 * `columns` (default all) of row groups [a, b), one array per column. The metadata is sliced
 * to exactly those groups: hyparquet 1.12's rowStart also reads the group ending at rowStart.
 * Binary columns stay bytes (`path` is UTF8-annotated, so it still decodes to strings).
 */
export const readRowGroups = async (
  file: AsyncBuffer,
  metadata: FileMetaData,
  a = 0,
  b = metadata.row_groups.length,
  columns?: string[]
): Promise<Columns> => {
  const parts: Record<string, ArrayLike<unknown>[]> = {};
  await parquetRead({
    file,
    metadata: {...metadata, row_groups: metadata.row_groups.slice(a, b)},
    columns,
    compressors,
    utf8: false,
    onChunk: ({columnName, columnData}) => (parts[columnName] ??= []).push(columnData),
  });
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, concat(v)]));
};

const readWhole = async (io: TopologyIO, url: string) => {
  const ab = await io.whole(url);
  const file = {byteLength: ab.byteLength, slice: (s: number, e?: number) => ab.slice(s, e)};
  const metadata = parquetMetadata(ab);
  return {columns: await readRowGroups(file, metadata), n: Number(metadata.num_rows)};
};

const demographyOf = (c: Columns, columns: string[], lo: number, hi: number) =>
  Object.fromEntries(columns.map(col => [col, floats(c[col], lo, hi)]));

const labelsOf = (c: Columns, lo: number, hi: number): Labels => ({
  lon: degrees(c.label_x, lo, hi),
  lat: degrees(c.label_y, lo, hi),
  areaM2: floats(c.area_m2, lo, hi),
});

export const loadParents = async (io: TopologyIO, base: string): Promise<TopologyState> => {
  const {columns: c, n} = await readWhole(io, fileUrl(base, 'parents'));
  const parents = decodeParents(c, n);
  const columns = demographyColumns(Object.keys(c));
  let B = 0;
  for (let i = 0; i < n; i++) B = Math.max(B, parents.childRowStart[i] + parents.childRowCount[i]);
  return {
    io,
    base,
    P: n,
    B,
    parents,
    parentIdx: new Map(parents.paths.map((path, i) => [path, i])),
    parentPaths: parents.paths,
    parentLabels: labelsOf(c, 0, n),
    // Copies: the originals go to the main thread with loadArcs.
    childRowStart: parents.childRowStart.slice(),
    childRowCount: parents.childRowCount.slice(),
    interiorRowStart: parents.interiorRowStart.slice(),
    interiorRowCount: parents.interiorRowCount.slice(),
    columns,
    parentDemography: demographyOf(c, columns, 0, n),
    children: new Map(),
    labels: new Map(),
    pending: new Map(),
  };
};

/** Exterior arcs, plus the parents decoded by loadParents (transferred, so call once). */
export const loadArcs = async (state: TopologyState): Promise<TopologyBase> => {
  const {columns, n} = await readWhole(state.io, fileUrl(state.base, 'arcs_exterior_blob'));
  const exterior = decodeArcs(columns, 0, n, 0);
  const parents = state.parents!;
  parents.bbox = unitBboxes(parents, exterior.bbox);
  state.parents = null;
  state.exteriorBbox = exterior.bbox.slice();
  return {P: state.P, B: state.B, E: n, parents, exterior};
};

/** loadParents then loadArcs, for tests and benches that want the base in one call. */
export const loadBase = async (io: TopologyIO, base: string) => {
  const state = await loadParents(io, base);
  return {state, result: await loadArcs(state)};
};

const rowGroupStarts = (metadata: FileMetaData) => {
  const starts = [0];
  for (const rg of metadata.row_groups)
    starts.push(starts[starts.length - 1] + Number(rg.num_rows));
  return starts;
};

const topLevelColumns = (metadata: FileMetaData) =>
  Array.from(new Set(metadata.row_groups[0].columns.map(c => c.meta_data!.path_in_schema[0])));

/**
 * Multi-range prefetch of `columns` (default all) of whole row groups, skipping bytes already
 * cached. Each group's range is the byte span hyparquet slices for those columns (from the first
 * to the last), so its read is one cache hit.
 */
const prefetchRowGroups = async (meta: MetaInfo, rowGroups: number[], columns?: string[]) => {
  const file = meta.file as EnhancedAsyncBuffer;
  if (!file.prefetch) return;
  const spans = rowGroups.map(g => {
    let start = Infinity;
    let end = 0;
    for (const {meta_data: m} of meta.metadata.row_groups[g].columns) {
      if (!m || (columns && !columns.includes(m.path_in_schema[0]))) continue;
      const s = Number(m.dictionary_page_offset || m.data_page_offset);
      start = Math.min(start, s);
      end = Math.max(end, s + Number(m.total_compressed_size));
    }
    return [start, end] as [number, number];
  });
  const cached = (s: number, e: number) => file._rangeCache.some(c => s >= c.start && e <= c.end);
  // No gap merging: the bytes between one group's span and the next are other phases' columns.
  const ranges = mergeByteRanges(spans, 0).filter(([s, e]) => !cached(s, e));
  // ponytail: prefetch sends its 24-part batches one after another; batching here runs them in parallel
  const batches: Promise<void>[] = [];
  for (let i = 0; i < ranges.length; i += 24) batches.push(file.prefetch(ranges.slice(i, i + 24)));
  await Promise.all(batches);
};

/**
 * Calls `each(k, columns, lo)` for each non-empty [start, end) row range k, with row `start` at
 * `columns`' row `lo`. Fetches every needed row group up front, then decodes one run at a time
 * (a run only spans the groups a range crosses), so one run's decoded columns are alive at once.
 */
const forEachRowRange = async (
  meta: MetaInfo,
  ranges: Array<[number, number]>,
  columns: string[] | undefined,
  each: (k: number, columns: Columns, lo: number) => void
) => {
  const starts = rowGroupStarts(meta.metadata);
  const groupOf = (row: number) => {
    let lo = 0;
    let hi = starts.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= row) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const spans = ranges
    .flatMap(([s, e], k) => (e > s ? [{a: groupOf(s), b: groupOf(e - 1) + 1, ks: [k]}] : []))
    .sort((x, y) => x.a - y.a);
  const runs: typeof spans = [];
  for (const span of spans) {
    const last = runs[runs.length - 1];
    if (last && span.a < last.b) {
      last.b = Math.max(last.b, span.b);
      last.ks.push(span.ks[0]);
    } else runs.push(span);
  }
  await prefetchRowGroups(
    meta,
    runs.flatMap(r => Array.from({length: r.b - r.a}, (_, i) => r.a + i)),
    columns
  );
  for (const run of runs) {
    const c = await readRowGroups(meta.file, meta.metadata, run.a, run.b, columns);
    for (const k of run.ks) each(k, c, ranges[k][0] - starts[run.a]);
  }
};

const childRanges = (state: TopologyState, parents: number[]) =>
  parents.map(
    p =>
      [state.childRowStart[p], state.childRowStart[p] + state.childRowCount[p]] as [number, number]
  );

/**
 * Loads one column group of the children of `parents` (deduped against loads in flight and
 * done): 'demography' is path, parent_idx and the demography columns; 'labels' LABEL_COLUMNS.
 */
export const loadChildren = async (state: TopologyState, parents: number[], group: ChildGroup) => {
  const store = group === 'demography' ? state.children : state.labels;
  const key = (p: number) => `${group}:${p}`;
  const missing = parents.filter(p => !store.has(p) && !state.pending.has(key(p)));
  if (missing.length) {
    const request = (async () => {
      const meta = await (state.childrenFile ??= state.io.ranged(fileUrl(state.base, 'children')));
      const ranges = childRanges(state, missing);
      const columns =
        group === 'labels'
          ? LABEL_COLUMNS
          : topLevelColumns(meta.metadata).filter(
              n => n === 'path' || n === 'parent_idx' || state.columns.includes(n)
            );
      const set = (k: number, c: Columns, lo: number) => {
        const hi = lo + ranges[k][1] - ranges[k][0];
        if (group === 'labels') state.labels.set(missing[k], labelsOf(c, lo, hi));
        else {
          const paths: string[] = new Array(hi - lo);
          for (let i = lo; i < hi; i++) paths[i - lo] = c.path[i] as string;
          state.children.set(missing[k], {
            paths,
            demography: demographyOf(c, state.columns, lo, hi),
          });
        }
      };
      await forEachRowRange(meta, ranges, columns, set);
      // Parents without children never reach `set`.
      missing.forEach((p, k) => {
        if (!store.has(p)) set(k, {}, 0);
      });
    })().finally(() => missing.forEach(p => state.pending.delete(key(p))));
    missing.forEach(p => state.pending.set(key(p), request));
  }
  await Promise.all(parents.map(p => state.pending.get(key(p))));
};

/** Shatter chunks of `parents`: children rings and interior arcs, after their other groups. */
export const loadChunks = async (
  state: TopologyState,
  parents: number[]
): Promise<ShatterChunk[]> => {
  if (!parents.length) return [];
  await Promise.all([
    loadChildren(state, parents, 'demography'),
    loadChildren(state, parents, 'labels'),
  ]);
  const E = state.exteriorBbox!.length / 4;
  const unitRanges = childRanges(state, parents);
  const interiorRanges = parents.map(
    p =>
      [state.interiorRowStart[p], state.interiorRowStart[p] + state.interiorRowCount[p]] as [
        number,
        number,
      ]
  );
  // Empty ranges never reach `each`, so they keep these empty decodes.
  const rings = parents.map(() => decodeRings({}, 0, 0));
  const interior = interiorRanges.map(([s], k) => decodeArcs({}, 0, 0, E + s, parents[k]));
  const childrenFile = state.childrenFile!;
  const interiorFile = (state.interiorFile ??= state.io.ranged(
    fileUrl(state.base, 'arcs_interior_blob')
  ));
  await Promise.all([
    childrenFile.then(meta =>
      forEachRowRange(meta, unitRanges, ['rings'], (k, c, lo) => {
        rings[k] = decodeRings(c, lo, lo + unitRanges[k][1] - unitRanges[k][0]);
      })
    ),
    interiorFile.then(meta =>
      forEachRowRange(meta, interiorRanges, undefined, (k, c, lo) => {
        const [s, e] = interiorRanges[k];
        interior[k] = decodeArcs(c, lo, lo + e - s, E + s, parents[k]);
      })
    ),
  ]);
  return parents.map((parent, k) => {
    const {paths, demography} = state.children.get(parent)!;
    const labels = state.labels.get(parent)!;
    return {
      parent,
      children: {
        firstUnit: state.P + unitRanges[k][0],
        paths,
        label: mercatorPoints(labels.lon, labels.lat),
        // Copies: the worker keeps its own for demography and labels.
        areaM2: labels.areaM2.slice(),
        totalPop: demography.total_pop_20.slice(),
        bbox: unitBboxes(rings[k], state.exteriorBbox!, interior[k]),
        ...rings[k],
      },
      interior: interior[k],
    };
  });
};

/** Parent idxs of `paths` (unknown paths dropped). */
export const parentIdxs = (state: TopologyState, paths: string[]) =>
  paths.flatMap(path => {
    const p = state.parentIdx.get(path);
    return p === undefined ? [] : [p];
  });

/**
 * Same shape as parseDemographyData: unshattered parents, then the children of each broken
 * parent whose demography group is loaded (a broken parent without one keeps its own row).
 */
export const buildDemography = (
  state: TopologyState,
  brokenIds: string[],
  parentLayer: string,
  childLayer: string | null
): {columns: AllTabularColumns[number][]; results: ColumnarTableData} => {
  const broken = parentIdxs(state, brokenIds).filter(p => state.children.has(p));
  const brokenSet = new Set(broken);
  const results: Record<string, unknown[]> = {path: [], sourceLayer: []};
  for (const col of state.columns) results[col] = [];
  for (let p = 0; p < state.P; p++) {
    if (brokenSet.has(p)) continue;
    results.path.push(state.parentPaths[p]);
    results.sourceLayer.push(parentLayer);
    for (const col of state.columns) results[col].push(state.parentDemography[col][p]);
  }
  for (const p of broken) {
    const {paths, demography} = state.children.get(p)!;
    for (let k = 0; k < paths.length; k++) {
      results.path.push(paths[k]);
      results.sourceLayer.push(childLayer);
      for (const col of state.columns) results[col].push(demography[col][k]);
    }
  }
  return {
    columns: Object.keys(results) as AllTabularColumns[number][],
    results: results as unknown as ColumnarTableData,
  };
};

/**
 * Label points shaped like getPointData's: every parent, or (with `parents`) the children of
 * those parents whose label group is loaded.
 */
export const buildPoints = (
  state: TopologyState,
  layer: string,
  source: string,
  parents?: number[]
): GeoJSON.FeatureCollection<GeoJSON.Point> => {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const add = (labels: Labels, paths: string[], pop: Float64Array) => {
    for (let k = 0; k < paths.length; k++) {
      features.push({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [labels.lon[k], labels.lat[k]]},
        properties: {path: paths[k], total_pop_20: pop[k], __source: source, __sourceLayer: layer},
      });
    }
  };
  if (!parents) {
    add(state.parentLabels, state.parentPaths, state.parentDemography.total_pop_20);
  } else {
    for (const p of parents) {
      const labels = state.labels.get(p);
      const children = state.children.get(p);
      if (labels && children) add(labels, children.paths, children.demography.total_pop_20);
    }
  }
  return {type: 'FeatureCollection', features};
};

/** Underlying buffers of every typed array in `objects`, for Comlink transfer. */
export const buffersOf = (...objects: object[]) => {
  const out = new Set<ArrayBuffer>();
  for (const o of objects)
    for (const v of Object.values(o)) if (ArrayBuffer.isView(v)) out.add(v.buffer as ArrayBuffer);
  return Array.from(out);
};
