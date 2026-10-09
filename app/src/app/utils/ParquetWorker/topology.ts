/**
 * Worker-side loader for the topology-parquet prototype (prototypes/topology-parquet/README.md).
 * Plain functions over an IO adapter so bun can run them against local files.
 */
import {AsyncBuffer, FileMetaData, parquetMetadata, parquetRead} from 'hyparquet';
import {compressors} from 'hyparquet-compressors';
import type {AllTabularColumns} from '../api/summaryStats';
import {
  Columns,
  decodeArcs,
  decodeParents,
  decodeUnits,
  demographyColumns,
  floats,
} from '../topology/decode';
import type {ArcChunk, ParentChunk, ShatterChunk} from '../topology/types';
import type {ColumnarTableData, MetaInfo} from './parquetWorker.types';
import {
  EnhancedAsyncBuffer,
  getByteRangesForRowGroups,
  mergeByteRanges,
} from './parquetWorkerUtils';

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

type Demography = Record<string, Float64Array>;

/** What the worker keeps per map after handing the typed arrays to the main thread. */
export interface TopologyState {
  P: number;
  E: number;
  parentIdx: Map<string, number>;
  parentPaths: string[];
  childRowStart: Uint32Array;
  childRowCount: Uint32Array;
  interiorRowStart: Uint32Array;
  interiorRowCount: Uint32Array;
  columns: string[];
  parentDemography: Demography;
  /** Children of each loaded parent: paths and demography. */
  children: Map<number, {paths: string[]; demography: Demography}>;
  childrenFile: Promise<MetaInfo>;
  interiorFile: Promise<MetaInfo>;
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
 * All columns of row groups [a, b), one array per column. The metadata is sliced to exactly
 * those groups: hyparquet 1.12's rowStart also reads the group ending at rowStart. Binary
 * columns stay bytes (`path` is UTF8-annotated, so it still decodes to strings).
 */
export const readRowGroups = async (
  file: AsyncBuffer,
  metadata: FileMetaData,
  a = 0,
  b = metadata.row_groups.length
): Promise<Columns> => {
  const parts: Record<string, ArrayLike<unknown>[]> = {};
  await parquetRead({
    file,
    metadata: {...metadata, row_groups: metadata.row_groups.slice(a, b)},
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

export const loadBase = async (
  io: TopologyIO,
  base: string
): Promise<{state: TopologyState; result: TopologyBase}> => {
  // Started now so the first shatter doesn't wait on HEAD + footer; awaited in loadChunks.
  const childrenFile = io.ranged(fileUrl(base, 'children'));
  const interiorFile = io.ranged(fileUrl(base, 'arcs_interior'));
  childrenFile.catch(() => {});
  interiorFile.catch(() => {});
  const [p, e] = await Promise.all([
    readWhole(io, fileUrl(base, 'parents')),
    // Binary xy decodes 1.6x faster than list<int32> xs/ys (decode.bench.ts).
    readWhole(io, fileUrl(base, 'arcs_exterior_blob')),
  ]);
  const parents = decodeParents(p.columns, p.n);
  const exterior = decodeArcs(e.columns, 0, e.n, 0);
  const columns = demographyColumns(Object.keys(p.columns));
  let B = 0;
  for (let i = 0; i < p.n; i++)
    B = Math.max(B, parents.childRowStart[i] + parents.childRowCount[i]);
  const state: TopologyState = {
    P: p.n,
    E: e.n,
    parentIdx: new Map(parents.paths.map((path, i) => [path, i])),
    parentPaths: parents.paths,
    // Copies: the originals are transferred to the main thread.
    childRowStart: parents.childRowStart.slice(),
    childRowCount: parents.childRowCount.slice(),
    interiorRowStart: parents.interiorRowStart.slice(),
    interiorRowCount: parents.interiorRowCount.slice(),
    columns,
    parentDemography: demographyOf(p.columns, columns, 0, p.n),
    children: new Map(),
    childrenFile,
    interiorFile,
  };
  return {state, result: {P: p.n, B, E: e.n, parents, exterior}};
};

const rowGroupStarts = (metadata: FileMetaData) => {
  const starts = [0];
  for (const rg of metadata.row_groups)
    starts.push(starts[starts.length - 1] + Number(rg.num_rows));
  return starts;
};

/** Multi-range prefetch of whole row groups, skipping bytes already cached. */
const prefetchRowGroups = async (meta: MetaInfo, rowGroups: number[]) => {
  const file = meta.file as EnhancedAsyncBuffer;
  if (!file.prefetch) return;
  const cached = (s: number, e: number) => file._rangeCache.some(c => s >= c.start && e <= c.end);
  const ranges = mergeByteRanges(getByteRangesForRowGroups(meta.metadata, rowGroups)).filter(
    ([s, e]) => !cached(s, e)
  );
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
    runs.flatMap(r => Array.from({length: r.b - r.a}, (_, i) => r.a + i))
  );
  for (const run of runs) {
    const columns = await readRowGroups(meta.file, meta.metadata, run.a, run.b);
    for (const k of run.ks) each(k, columns, ranges[k][0] - starts[run.a]);
  }
};

/** Children and interior arcs of `parents`; caches the children's demography for getDemography. */
export const loadChunks = async (
  state: TopologyState,
  parents: number[]
): Promise<ShatterChunk[]> => {
  const rowRanges = (start: Uint32Array, count: Uint32Array) =>
    parents.map(p => [start[p], start[p] + count[p]] as [number, number]);
  const childRanges = rowRanges(state.childRowStart, state.childRowCount);
  const interiorRanges = rowRanges(state.interiorRowStart, state.interiorRowCount);
  // Empty ranges never reach `each`, so they keep these empty chunks.
  const children = childRanges.map(([s]) => decodeUnits({}, 0, 0, state.P + s));
  const demography = parents.map(() => demographyOf({}, state.columns, 0, 0));
  const interior = interiorRanges.map(([s], k) => decodeArcs({}, 0, 0, state.E + s, parents[k]));
  await Promise.all([
    state.childrenFile.then(meta =>
      forEachRowRange(meta, childRanges, (k, c, lo) => {
        const [s, e] = childRanges[k];
        children[k] = decodeUnits(c, lo, lo + e - s, state.P + s);
        demography[k] = demographyOf(c, state.columns, lo, lo + e - s);
      })
    ),
    state.interiorFile.then(meta =>
      forEachRowRange(meta, interiorRanges, (k, c, lo) => {
        const [s, e] = interiorRanges[k];
        interior[k] = decodeArcs(c, lo, lo + e - s, state.E + s, parents[k]);
      })
    ),
  ]);
  return parents.map((parent, k) => {
    state.children.set(parent, {paths: children[k].paths, demography: demography[k]});
    return {parent, children: children[k], interior: interior[k]};
  });
};

/**
 * Same shape as parseDemographyData: unshattered parents, then the children of each broken
 * parent whose chunk is loaded (a broken parent without one keeps its own row).
 */
export const buildDemography = (
  state: TopologyState,
  brokenIds: string[],
  parentLayer: string,
  childLayer: string | null
): {columns: AllTabularColumns[number][]; results: ColumnarTableData} => {
  const broken: number[] = [];
  for (const id of brokenIds) {
    const p = state.parentIdx.get(id);
    if (p !== undefined && state.children.has(p)) broken.push(p);
  }
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

/** Underlying buffers of every typed array in `objects`, for Comlink transfer. */
export const buffersOf = (...objects: object[]) => {
  const out = new Set<ArrayBuffer>();
  for (const o of objects)
    for (const v of Object.values(o)) if (ArrayBuffer.isView(v)) out.add(v.buffer as ArrayBuffer);
  return Array.from(out);
};
