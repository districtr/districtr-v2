import Flatbush from 'flatbush';
import type {ArcChunk, ShatterChunk, Topology, UnitChunk} from './types';

/** A flatbush over chunk bboxes; item i is local `localOf[i]` of `chunkOf[i]`. */
export interface ChunkIndex<C> {
  index: Flatbush;
  chunkOf: C[];
  localOf: Uint32Array;
}

export interface TopologyIndexes {
  topo: Topology;
  version: number;
  /** All exterior arcs; built once per topology. */
  exterior: ChunkIndex<ArcChunk>;
  /** Interior arcs of shattered parents; null when nothing is shattered. */
  interior: ChunkIndex<ArcChunk> | null;
  /** Active units: unshattered parents plus children of shattered parents. */
  units: ChunkIndex<UnitChunk>;
  /** Children chunk -> its shatter chunk, so ring walks find interior arcs directly. */
  shatterOf: Map<UnitChunk, ShatterChunk>;
  /** Time spent on the last rebuild of the version-dependent indexes. */
  rebuildMs: number;
}

const buildIndex = <C extends {bbox: Float64Array}>(
  chunks: C[],
  keep?: (chunk: C, local: number) => boolean
): ChunkIndex<C> | null => {
  let n = 0;
  for (const c of chunks) {
    const len = c.bbox.length / 4;
    if (!keep) n += len;
    else for (let k = 0; k < len; k++) if (keep(c, k)) n++;
  }
  if (!n) return null;
  const index = new Flatbush(n);
  const chunkOf: C[] = new Array(n);
  const localOf = new Uint32Array(n);
  for (const c of chunks) {
    const b = c.bbox;
    for (let k = 0; k < b.length / 4; k++) {
      if (keep && !keep(c, k)) continue;
      const i = index.add(b[4 * k], b[4 * k + 1], b[4 * k + 2], b[4 * k + 3]);
      chunkOf[i] = c;
      localOf[i] = k;
    }
  }
  index.finish();
  return {index, chunkOf, localOf};
};

let cache: TopologyIndexes | null = null;

/** Indexes for the topology's current shatter state; rebuilt when `topo.version` moves. */
export const getIndexes = (topo: Topology): TopologyIndexes => {
  if (cache?.topo === topo && cache.version === topo.version) return cache;
  const exterior = cache?.topo === topo ? cache.exterior : buildIndex([topo.exterior])!;
  const t0 = performance.now();
  const shattered: ShatterChunk[] = [];
  topo.shattered.forEach(p => {
    const c = topo.chunks.get(p);
    if (c) shattered.push(c);
  });
  const parents = topo.parents;
  cache = {
    topo,
    version: topo.version,
    exterior,
    interior: buildIndex(shattered.map(c => c.interior)),
    units: buildIndex<UnitChunk>(
      [parents, ...shattered.map(c => c.children)],
      (c, k) => c !== parents || !topo.shattered.has(k)
    )!,
    shatterOf: new Map(shattered.map(c => [c.children, c])),
    rebuildMs: 0,
  };
  cache.rebuildMs = performance.now() - t0;
  return cache;
};
