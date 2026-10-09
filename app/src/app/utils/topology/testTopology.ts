/**
 * Test-only topologies. gridTopology: a 3×3 grid of parents, each a 2×2 grid of children,
 * with every child's chunk loaded and parent 4 (the center) shattered. loadTopologyDir: one
 * map's topology parquets from local files, through the worker's loader.
 */
import {readFile} from 'fs/promises';
import {asyncBufferFromFile, parquetMetadataAsync} from 'hyparquet';
import {loadBase, loadChunks} from '../ParquetWorker/topology';
import type {ArcChunk, ParentChunk, ShatterChunk, Topology, UnitChunk} from './types';

export const ORIGIN = {x: 0.2, y: 0.4};
/** Child cell size in Mercator units. */
export const CELL = 0.001;
const N = 6;

const parentOf = (i: number, j: number) => Math.floor(j / 2) * 3 + Math.floor(i / 2);
const childRow = (i: number, j: number) => parentOf(i, j) * 4 + (j % 2) * 2 + (i % 2);
const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N;

interface Edge {
  /** Grid nodes, in arc direction. */
  from: [number, number];
  to: [number, number];
  /** Child cells on each side ([i, j] or null = outside). */
  a: [number, number] | null;
  b: [number, number] | null;
}

// Horizontal edges run east with a = the cell to their north (smaller Mercator y);
// vertical edges run south with a = the cell to their east. Interior is to the left of
// forward arcs in lon/lat, as in the parquet contract.
const hEdge = (i: number, j: number): Edge => ({
  from: [i, j],
  to: [i + 1, j],
  a: inGrid(i, j - 1) ? [i, j - 1] : null,
  b: inGrid(i, j) ? [i, j] : null,
});
const vEdge = (i: number, j: number): Edge => ({
  from: [i, j],
  to: [i, j + 1],
  a: inGrid(i, j) ? [i, j] : null,
  b: inGrid(i - 1, j) ? [i - 1, j] : null,
});

const arcChunk = (edges: Edge[], firstArc: number): ArcChunk => {
  const n = edges.length;
  const coords = new Float64Array(n * 6);
  const offsets = new Uint32Array(n + 1);
  const bbox = new Float64Array(n * 4);
  const side = (c: [number, number] | null, f: (i: number, j: number) => number) =>
    c ? f(c[0], c[1]) : -1;
  const chunk: ArcChunk = {
    firstArc,
    coords,
    offsets,
    bbox,
    lengthM: new Float64Array(n).fill(100),
    aParent: Int32Array.from(edges, e => side(e.a, parentOf)),
    bParent: Int32Array.from(edges, e => side(e.b, parentOf)),
    aChild: Int32Array.from(edges, e => side(e.a, childRow)),
    bChild: Int32Array.from(edges, e => side(e.b, childRow)),
  };
  edges.forEach((e, k) => {
    const [x0, y0] = [ORIGIN.x + e.from[0] * CELL, ORIGIN.y + e.from[1] * CELL];
    const [x1, y1] = [ORIGIN.x + e.to[0] * CELL, ORIGIN.y + e.to[1] * CELL];
    // A collinear midpoint so arcs have more than one segment.
    coords.set([x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1], k * 6);
    offsets[k + 1] = (k + 1) * 3;
    bbox.set([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)], k * 4);
  });
  return chunk;
};

export const gridTopology = (shattered: number[] = [4]): Topology => {
  const edges: Edge[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) edges.push(hEdge(i, j));
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) edges.push(vEdge(i, j));
  const isInterior = (e: Edge) => !!e.a && !!e.b && parentOf(...e.a) === parentOf(...e.b);
  const exteriorEdges = edges.filter(e => !isInterior(e));
  const interiorByParent = Array.from({length: 9}, (_, p) =>
    edges.filter(e => isInterior(e) && parentOf(...e.a!) === p)
  );
  const E = exteriorEdges.length;
  const key = (e: Edge) => `${e.from}-${e.to}`;
  const arcId = new Map<string, number>(exteriorEdges.map((e, k) => [key(e), k]));
  let interiorRow = 0;
  const interiorStart = interiorByParent.map(list => {
    const start = interiorRow;
    list.forEach((e, k) => arcId.set(key(e), E + start + k));
    interiorRow += list.length;
    return start;
  });
  const ref = (e: Edge, forward: boolean) => {
    const id = arcId.get(key(e))!;
    return forward ? id : ~id;
  };
  // CCW (lon/lat) ring around cells [i0, i1) × [j0, j1): south, east, north, west.
  const ring = (i0: number, i1: number, j0: number, j1: number) => {
    const refs: number[] = [];
    for (let i = i0; i < i1; i++) refs.push(ref(hEdge(i, j1), true));
    for (let j = j1 - 1; j >= j0; j--) refs.push(ref(vEdge(i1, j), false));
    for (let i = i1 - 1; i >= i0; i--) refs.push(ref(hEdge(i, j0), false));
    for (let j = j0; j < j1; j++) refs.push(ref(vEdge(i0, j), true));
    return refs;
  };
  const unitChunk = (
    firstUnit: number,
    paths: string[],
    cells: [number, number, number, number][]
  ): UnitChunk => {
    const rings = cells.map(c => ring(...c));
    const refStart = new Uint32Array(rings.length + 1);
    rings.forEach((r, k) => (refStart[k + 1] = refStart[k] + r.length));
    return {
      firstUnit,
      paths,
      bbox: Float64Array.from(
        cells.flatMap(([i0, i1, j0, j1]) => [
          ORIGIN.x + i0 * CELL,
          ORIGIN.y + j0 * CELL,
          ORIGIN.x + i1 * CELL,
          ORIGIN.y + j1 * CELL,
        ])
      ),
      label: Float64Array.from(
        cells.flatMap(([i0, i1, j0, j1]) => [
          ORIGIN.x + ((i0 + i1) / 2) * CELL,
          ORIGIN.y + ((j0 + j1) / 2) * CELL,
        ])
      ),
      areaM2: new Float64Array(cells.length).fill(1),
      totalPop: Float64Array.from(paths, (_, k) => 10 * (firstUnit + k + 1)),
      ringStart: Uint32Array.from({length: cells.length + 1}, (_, k) => k),
      refStart,
      refs: Int32Array.from(rings.flat()),
    };
  };
  const P = 9;
  const parentCells = Array.from({length: P}, (_, p) => {
    const [pi, pj] = [p % 3, Math.floor(p / 3)];
    return [2 * pi, 2 * pi + 2, 2 * pj, 2 * pj + 2] as [number, number, number, number];
  });
  const parents: ParentChunk = {
    ...unitChunk(
      0,
      parentCells.map((_, p) => `vtd:P${p}`),
      parentCells
    ),
    childRowStart: Uint32Array.from({length: P}, (_, p) => p * 4),
    childRowCount: new Uint32Array(P).fill(4),
    interiorRowStart: Uint32Array.from(interiorStart),
    interiorRowCount: Uint32Array.from(interiorByParent, l => l.length),
  };
  const chunks = new Map<number, ShatterChunk>();
  for (let p = 0; p < P; p++) {
    const [i0, , j0] = parentCells[p];
    const cells: [number, number, number, number][] = [0, 1, 2, 3].map(l => {
      const [i, j] = [i0 + (l % 2), j0 + Math.floor(l / 2)];
      return [i, i + 1, j, j + 1];
    });
    chunks.set(p, {
      parent: p,
      children: unitChunk(
        P + p * 4,
        cells.map((_, l) => `b${p}_${l}`),
        cells
      ),
      interior: arcChunk(interiorByParent[p], E + interiorStart[p]),
    });
  }
  const unitByPath = new Map<string, number>();
  parents.paths.forEach((path, k) => unitByPath.set(path, k));
  chunks.forEach(c =>
    c.children.paths.forEach((path, k) => unitByPath.set(path, P + c.parent * 4 + k))
  );
  return {
    P,
    B: P * 4,
    E,
    parents,
    exterior: arcChunk(exteriorEdges, 0),
    chunks,
    shattered: new Set(shattered),
    unitByPath,
    version: 0,
  };
};

/** Mercator point at grid position (i, j), in child cells from the origin. */
export const at = (i: number, j: number) => ({x: ORIGIN.x + i * CELL, y: ORIGIN.y + j * CELL});

/** Reads `dir`/{parents,arcs_exterior,children,arcs_interior}.parquet; `shattered` parent idxs. */
export const loadTopologyDir = async (dir: string, shattered: number[] = []): Promise<Topology> => {
  const {state, result} = await loadBase(
    {
      whole: async path => {
        const b = await readFile(path);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      },
      ranged: async path => {
        const file = await asyncBufferFromFile(path);
        const metadata = await parquetMetadataAsync(file);
        return {url: path, byteLength: file.byteLength, file, metadata};
      },
    },
    dir
  );
  const chunks = await loadChunks(state, shattered);
  const unitByPath = new Map(result.parents.paths.map((path, i) => [path, i]));
  for (const {children} of chunks) {
    children.paths.forEach((path, k) => unitByPath.set(path, children.firstUnit + k));
  }
  return {
    ...result,
    chunks: new Map(chunks.map(c => [c.parent, c])),
    shattered: new Set(shattered),
    unitByPath,
    version: 0,
  };
};
