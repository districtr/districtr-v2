/**
 * In-memory topology for the topology-parquet prototype
 * (prototypes/topology-parquet/README.md).
 *
 * Coordinates are MapLibre MercatorCoordinate units (0..1, y grows south).
 * Unit ids: parents 0..P-1 (row in parents.parquet); children P + row in children.parquet.
 * Arc ids: exterior 0..E-1 (row in arcs_exterior.parquet); interior E + row in arcs_interior.parquet.
 * Ring refs: i = arc i forward, ~i (= -i-1) = arc i reversed.
 */

/** A contiguous run of arcs: all exterior arcs, or one shattered parent's interior arcs. */
export interface ArcChunk {
  /** Global arc id of local arc 0. */
  firstArc: number;
  /** Interleaved x,y for every vertex of every arc in this chunk. */
  coords: Float64Array;
  /** n+1 vertex offsets: local arc k spans vertices [offsets[k], offsets[k+1]). */
  offsets: Uint32Array;
  /** 4n: minx, miny, maxx, maxy. */
  bbox: Float64Array;
  /** n geodesic lengths in meters (full resolution). */
  lengthM: Float64Array;
  /** Parent idx on each side, -1 = outside. Interior chunks: both are the owning parent. */
  aParent: Int32Array;
  bParent: Int32Array;
  /** Child row (0..B-1) on each side, -1 = outside. */
  aChild: Int32Array;
  bChild: Int32Array;
}

/** A contiguous run of units: all parents, or one shattered parent's children. */
export interface UnitChunk {
  /** Global unit id of local unit 0 (0 for parents, P + child_row_start for children). */
  firstUnit: number;
  paths: string[];
  /** 4n: minx, miny, maxx, maxy. */
  bbox: Float64Array;
  /** 2n label point (point_on_surface). */
  label: Float64Array;
  areaM2: Float64Array;
  totalPop: Float64Array;
  /** n+1: local unit k owns rings [ringStart[k], ringStart[k+1]). */
  ringStart: Uint32Array;
  /** nRings+1: ring r is refs [refStart[r], refStart[r+1]). */
  refStart: Uint32Array;
  /** Global arc refs. */
  refs: Int32Array;
}

export interface ParentChunk extends UnitChunk {
  childRowStart: Uint32Array;
  childRowCount: Uint32Array;
  interiorRowStart: Uint32Array;
  interiorRowCount: Uint32Array;
}

export interface ShatterChunk {
  parent: number;
  children: UnitChunk;
  interior: ArcChunk;
}

export interface Topology {
  /** Parent, child and exterior-arc counts. */
  P: number;
  B: number;
  E: number;
  parents: ParentChunk;
  exterior: ArcChunk;
  /** Loaded shatter chunks by parent idx; kept after a heal so re-shatter is free. */
  chunks: Map<number, ShatterChunk>;
  /** Parent idxs currently shattered (always a subset of chunks' keys). */
  shattered: Set<number>;
  /** path -> global unit id, for parents and every loaded child. */
  unitByPath: Map<string, number>;
  /** Bumps whenever `shattered` changes. */
  version: number;
}
