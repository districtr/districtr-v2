/**
 * Decoding of the topology parquet columns (prototypes/topology-parquet/README.md) into the
 * in-memory chunks of ./types. Pure functions: the ParquetWorker runs them, bun tests them.
 */
import type {ArcChunk, ParentChunk} from './types';

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

/**
 * children.parquet columns by load phase: demography first (path, parent_idx and the
 * demography columns), labels next, rings with the arcs.
 */
export const LABEL_COLUMNS = ['area_m2', 'label_x', 'label_y'];

/** Columns that are not demography in parents.parquet / children.parquet. */
const STRUCTURAL = new Set([
  'path',
  'parent_idx',
  ...LABEL_COLUMNS,
  'rings',
  // Pre-compact files only; bboxes are computed from the arcs.
  'xmin',
  'ymin',
  'xmax',
  'ymax',
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

/** int32 lon or lat x 1e6 -> degrees. */
export const degrees = (col: ArrayLike<unknown>, lo: number, hi: number) => {
  const out = new Float64Array(hi - lo);
  for (let i = lo; i < hi; i++) out[i - lo] = Number(col[i]) / SCALE;
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

/** Degree points -> 2n interleaved mercator. */
export const mercatorPoints = (lon: Float64Array, lat: Float64Array) => {
  const out = new Float64Array(2 * lon.length);
  for (let i = 0; i < lon.length; i++) {
    out[2 * i] = mercX(lon[i]);
    out[2 * i + 1] = mercY(lat[i]);
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

/** `rings` of rows [lo, hi). */
export const decodeRings = (c: Columns, lo: number, hi: number) => rings(c.rings, lo, hi);

/**
 * 4n unit bboxes: the union of the bboxes of the arcs their rings use (exterior arcs, plus one
 * parent's interior arcs for children).
 */
export const unitBboxes = (
  units: {ringStart: Uint32Array; refStart: Uint32Array; refs: Int32Array},
  exterior: Float64Array,
  interior?: {firstArc: number; bbox: Float64Array}
) => {
  const {ringStart, refStart, refs} = units;
  const E = exterior.length / 4;
  const out = new Float64Array(4 * (ringStart.length - 1));
  for (let k = 0; k < ringStart.length - 1; k++) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let f = refStart[ringStart[k]]; f < refStart[ringStart[k + 1]]; f++) {
      const arc = refs[f] < 0 ? ~refs[f] : refs[f];
      const b = arc < E ? exterior : interior!.bbox;
      const i = 4 * (arc < E ? arc : arc - interior!.firstArc);
      x0 = Math.min(x0, b[i]);
      y0 = Math.min(y0, b[i + 1]);
      x1 = Math.max(x1, b[i + 2]);
      y1 = Math.max(y1, b[i + 3]);
    }
    out[4 * k] = x0;
    out[4 * k + 1] = y0;
    out[4 * k + 2] = x1;
    out[4 * k + 3] = y1;
  }
  return out;
};

/**
 * Binary `xy`: little-endian int32 lon/lat x 1e6 [x0, y0, dx1, dy1, ...], the first vertex
 * absolute and the rest differences from the previous one -> interleaved mercator x,y, n+1
 * vertex offsets, and 4n mercator bboxes (minx, miny, maxx, maxy) of the decoded vertices.
 */
export const decodeArcBlobs = (xy: ArrayLike<Uint8Array>, lo: number, hi: number) => {
  let n = 0;
  for (let k = lo; k < hi; k++) n += xy[k].byteLength >> 3;
  const coords = new Float64Array(2 * n);
  const offsets = new Uint32Array(hi - lo + 1);
  const bbox = new Float64Array(4 * (hi - lo));
  let v = 0;
  for (let k = lo; k < hi; k++) {
    const b = xy[k];
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let x = 0;
    let y = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < b.byteLength; i += 8, v++) {
      x += view.getInt32(i, true);
      y += view.getInt32(i + 4, true);
      const mx = mercX(x / SCALE);
      const my = mercY(y / SCALE);
      coords[2 * v] = mx;
      coords[2 * v + 1] = my;
      if (mx < x0) x0 = mx;
      if (mx > x1) x1 = mx;
      if (my < y0) y0 = my;
      if (my > y1) y1 = my;
    }
    const j = 4 * (k - lo);
    bbox[j] = x0;
    bbox[j + 1] = y0;
    bbox[j + 2] = x1;
    bbox[j + 3] = y1;
    offsets[k - lo + 1] = v;
  }
  return {coords, offsets, bbox};
};

export const decodeParents = (c: Columns, n: number): ParentChunk => {
  const paths: string[] = new Array(n);
  for (let i = 0; i < n; i++) paths[i] = c.path[i] as string;
  return {
    firstUnit: 0,
    paths,
    label: mercatorPoints(degrees(c.label_x, 0, n), degrees(c.label_y, 0, n)),
    areaM2: floats(c.area_m2, 0, n),
    totalPop: floats(c.total_pop_20, 0, n),
    // Filled by unitBboxes once the exterior arcs are decoded.
    bbox: new Float64Array(0),
    ...decodeRings(c, 0, n),
    childRowStart: uints(c.child_row_start, 0, n),
    childRowCount: uints(c.child_row_count, 0, n),
    interiorRowStart: uints(c.interior_row_start, 0, n),
    interiorRowCount: uints(c.interior_row_count, 0, n),
  };
};

/**
 * Rows [lo, hi) of arcs_exterior_blob.parquet, or of arcs_interior_blob.parquet when `parent`
 * (the owning parent idx, used for both sides) is given.
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
    ...decodeArcBlobs(c.xy as ArrayLike<Uint8Array>, lo, hi),
    lengthM: floats(c.length_m, lo, hi),
    aParent: parent === undefined ? ints(c.a_parent, lo, hi) : own(),
    bParent: parent === undefined ? ints(c.b_parent, lo, hi) : own(),
    aChild: ints(c.a_child, lo, hi),
    bChild: ints(c.b_child, lo, hi),
  };
};
