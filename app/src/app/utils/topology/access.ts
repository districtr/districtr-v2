import type {ArcChunk, ShatterChunk, Topology, UnitChunk} from './types';

/** Chunk holding a global unit id, plus the unit's local index in it. */
export const unitOf = (
  topo: Topology,
  unit: number
): {chunk: UnitChunk; local: number} | undefined => {
  if (unit < topo.P) return {chunk: topo.parents, local: unit};
  // ponytail: linear scan over loaded chunks (~hundreds); index by row if it shows in profiles
  for (const c of topo.chunks.values()) {
    const local = unit - c.children.firstUnit;
    if (local >= 0 && local < c.children.paths.length) return {chunk: c.children, local};
  }
  return undefined;
};

export const unitPath = (topo: Topology, unit: number) => {
  const u = unitOf(topo, unit);
  return u ? u.chunk.paths[u.local] : undefined;
};

/** Chunk holding a global arc id, plus the arc's local index in it. */
export const arcOf = (
  topo: Topology,
  arc: number,
  hint?: ShatterChunk
): {chunk: ArcChunk; local: number} | undefined => {
  if (arc < topo.E) return {chunk: topo.exterior, local: arc};
  for (const c of hint ? [hint, ...topo.chunks.values()] : topo.chunks.values()) {
    const local = arc - c.interior.firstArc;
    if (local >= 0 && local < c.interior.lengthM.length) return {chunk: c.interior, local};
  }
  return undefined;
};

/**
 * Active unit on one side of an arc: the child if that side's parent is shattered, else the
 * parent. -1 = outside the map.
 */
export const side = (topo: Topology, chunk: ArcChunk, local: number, s: 'a' | 'b'): number => {
  const parent = s === 'a' ? chunk.aParent[local] : chunk.bParent[local];
  if (parent < 0) return -1;
  if (!topo.shattered.has(parent)) return parent;
  return topo.P + (s === 'a' ? chunk.aChild[local] : chunk.bChild[local]);
};
