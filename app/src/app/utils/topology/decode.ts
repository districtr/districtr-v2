/**
 * Decoding of the topology parquet columns (prototypes/topology-parquet/README.md) into the
 * in-memory chunks of ./types. Pure functions: the ParquetWorker runs them, bun tests them.
 */
import type {ArcChunk, ParentChunk, UnitChunk} from './types';

/** Decoded parquet columns by name: typed arrays, or arrays for strings and lists. */
export type Columns = Record<string, ArrayLike<unknown>>;

const SCALE = 1e6;
const DEG = Math.PI / 180;

export const mercX = (lon: number) => (lon + 180) / 360;
export const mercY = (lat: number) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / Math.PI) / 2;
export const lonOfMercX = (x: number) => x * 360 - 180;
export const latOfMercY = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;

/** Columns that are not demography in parents.parquet / children.parquet. */
const STRUCTURAL = new Set([
  'path',
  'parent_idx',
  'area_m2',
  'label_x',
  'label_y',
  'xmin',
  'ymin',
  'xmax',
  'ymax',
  'rings',
  'child_row_start',
  'child_row_count',
  'interior_row_start',
  'interior_row_count',
]);

/** Demography column names, sorted like the tabular parquet's column_name values. */
export const demographyColumns = (names: Iterable<string>) =>
  Array.from(names)
    .filter(n => !STRUCTURAL.has(n))
    .sort();

export const floats = (col: ArrayLike<unknown>, lo: number, hi: number) => {
  const out = new Float64Array(hi - lo);
  for (let i = lo; i < hi; i++) out[i - lo] = Number(col[i]);
  return out;
};

const ints = (col: ArrayLike<unknown>, lo: number, hi: number) => {
  const out = new Int32Array(hi - lo);
  for (let i = lo; i < hi; i++) out[i - lo] = Number(col[i]);
  return out;
};

const uints = (col: ArrayLike<unknown>, lo: number, hi: number) => {
  const out = new Uint32Array(hi - lo);
  for (let i = lo; i < hi; i++) out[i - lo] = Number(col[i]);
  return out;
};

/** int32 lon/lat bboxes -> 4n mercator minx, miny, maxx, maxy (mercator y grows south). */
const bboxes = (c: Columns, lo: number, hi: number) => {
  const out = new Float64Array(4 * (hi - lo));
  for (let i = lo, k = 0; i < hi; i++, k += 4) {
    out[k] = mercX(Number(c.xmin[i]) / SCALE);
    out[k + 1] = mercY(Number(c.ymax[i]) / SCALE);
    out[k + 2] = mercX(Number(c.xmax[i]) / SCALE);
    out[k + 3] = mercY(Number(c.ymin[i]) / SCALE);
  }
  return out;
};

const labels = (c: Columns, lo: number, hi: number) => {
  const out = new Float64Array(2 * (hi - lo));
  for (let i = lo, k = 0; i < hi; i++, k += 2) {
    out[k] = mercX(Number(c.label_x[i]) / SCALE);
    out[k + 1] = mercY(Number(c.label_y[i]) / SCALE);
  }
  return out;
};

/** rings list<list<int32>> -> ringStart / refStart / refs. */
const rings = (col: ArrayLike<unknown>, lo: number, hi: number) => {
  const units = col as ArrayLike<ArrayLike<ArrayLike<number>> | null>;
  let nRings = 0;
  let nRefs = 0;
  for (let i = lo; i < hi; i++) {
    const unit = units[i];
    if (!unit) continue;
    nRings += unit.length;
    for (let r = 0; r < unit.length; r++) nRefs += unit[r].length;
  }
  const ringStart = new Uint32Array(hi - lo + 1);
  const refStart = new Uint32Array(nRings + 1);
  const refs = new Int32Array(nRefs);
  let r = 0;
  let f = 0;
  for (let i = lo; i < hi; i++) {
    const unit = units[i];
    for (let k = 0; unit && k < unit.length; k++) {
      refs.set(unit[k], f);
      f += unit[k].length;
      refStart[++r] = f;
    }
    ringStart[i - lo + 1] = r;
  }
  return {ringStart, refStart, refs};
};

/**
 * Arcs are delta-encoded int32 lon/lat x 1e6 (first vertex absolute, the rest differences from
 * the previous vertex); both decoders return interleaved mercator x,y plus n+1 vertex offsets.
 */

/** Binary `xy`: little-endian int32 [x0, y0, dx1, dy1, ...] (arcs_exterior_blob.parquet). */
export const decodeArcBlobs = (xy: ArrayLike<Uint8Array>, lo: number, hi: number) => {
  let n = 0;
  for (let k = lo; k < hi; k++) n += xy[k].byteLength >> 3;
  const coords = new Float64Array(2 * n);
  const offsets = new Uint32Array(hi - lo + 1);
  let v = 0;
  for (let k = lo; k < hi; k++) {
    const b = xy[k];
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let x = 0;
    let y = 0;
    for (let i = 0; i < b.byteLength; i += 8, v++) {
      x += view.getInt32(i, true);
      y += view.getInt32(i + 4, true);
      coords[2 * v] = mercX(x / SCALE);
      coords[2 * v + 1] = mercY(y / SCALE);
    }
    offsets[k - lo + 1] = v;
  }
  return {coords, offsets};
};

/**
 * list<int32> `xs` / `ys`.
 * ponytail: kept only because arcs_interior has no blob variant yet; delete once it does
 * (blob decodes 1.6x faster, see decode.bench.ts).
 */
export const decodeArcLists = (
  xs: ArrayLike<ArrayLike<number>>,
  ys: ArrayLike<ArrayLike<number>>,
  lo: number,
  hi: number
) => {
  let n = 0;
  for (let k = lo; k < hi; k++) n += xs[k].length;
  const coords = new Float64Array(2 * n);
  const offsets = new Uint32Array(hi - lo + 1);
  let v = 0;
  for (let k = lo; k < hi; k++) {
    const ax = xs[k];
    const ay = ys[k];
    let x = 0;
    let y = 0;
    for (let i = 0; i < ax.length; i++, v++) {
      x += ax[i];
      y += ay[i];
      coords[2 * v] = mercX(x / SCALE);
      coords[2 * v + 1] = mercY(y / SCALE);
    }
    offsets[k - lo + 1] = v;
  }
  return {coords, offsets};
};

/** Rows [lo, hi) of parents.parquet or children.parquet. */
export const decodeUnits = (c: Columns, lo: number, hi: number, firstUnit: number): UnitChunk => {
  const paths: string[] = new Array(hi - lo);
  for (let i = lo; i < hi; i++) paths[i - lo] = c.path[i] as string;
  return {
    firstUnit,
    paths,
    bbox: bboxes(c, lo, hi),
    label: labels(c, lo, hi),
    areaM2: floats(c.area_m2, lo, hi),
    totalPop: floats(c.total_pop_20, lo, hi),
    ...rings(c.rings, lo, hi),
  };
};

export const decodeParents = (c: Columns, n: number): ParentChunk => ({
  ...decodeUnits(c, 0, n, 0),
  childRowStart: uints(c.child_row_start, 0, n),
  childRowCount: uints(c.child_row_count, 0, n),
  interiorRowStart: uints(c.interior_row_start, 0, n),
  interiorRowCount: uints(c.interior_row_count, 0, n),
});

/**
 * Rows [lo, hi) of arcs_exterior_blob.parquet, or of arcs_interior.parquet when `parent` (the
 * owning parent idx, used for both sides) is given.
 */
export const decodeArcs = (
  c: Columns,
  lo: number,
  hi: number,
  firstArc: number,
  parent?: number
): ArcChunk => {
  const own = () => new Int32Array(hi - lo).fill(parent!);
  return {
    firstArc,
    ...(c.xy
      ? decodeArcBlobs(c.xy as ArrayLike<Uint8Array>, lo, hi)
      : decodeArcLists(
          c.xs as ArrayLike<ArrayLike<number>>,
          c.ys as ArrayLike<ArrayLike<number>>,
          lo,
          hi
        )),
    bbox: bboxes(c, lo, hi),
    lengthM: floats(c.length_m, lo, hi),
    aParent: parent === undefined ? ints(c.a_parent, lo, hi) : own(),
    bParent: parent === undefined ? ints(c.b_parent, lo, hi) : own(),
    aChild: ints(c.a_child, lo, hi),
    bChild: ints(c.b_child, lo, hi),
  };
};
