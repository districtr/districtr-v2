import type {Geometry} from 'geojson';

/** A paintable unit in view: an unbroken parent, or a block of a broken-down parent. */
export type TuneUnit = {
  id: string;
  sourceLayer: string;
  pop: number;
  zone: number | null;
};
/** Repaint `unit` into district `to`. */
export type TuneMove = {unit: TuneUnit; to: number};
export type TuneOption = {
  moves: TuneMove[];
  /** Population the target gains (negative = gives away). */
  net: number;
  /** How far the target still sits from ideal after the moves. */
  error: number;
  /** Signed deviation after the moves, for every district the option touches. */
  after: Map<number, number>;
  /** Summed change in |deviation| of the other districts touched; negative helps them. */
  collateral: number;
};

type ViewFeature = {
  id?: string | number;
  sourceLayer?: string;
  properties: Record<string, any> | null;
  geometry: Geometry;
};

/**
 * Dedupes tile-split pieces into units and finds neighbors by snapping vertices
 * to a `cell`-sized grid. On unsimplified tiles, units sharing ≥2 cells share an
 * edge and a lone shared cell is a corner touch, which the contiguity check
 * (rook) doesn't count; simplified tiles drop shared vertices, so callers pass
 * `minShared` 1 there and accept the odd corner.
 * ponytail: vertex snapping, not a real graph; swap for the backend graph if
 * corner touches or missed edges start to matter.
 */
export const buildViewGraph = (
  features: ViewFeature[],
  zoneOf: (id: string) => number | null,
  cell: number,
  minShared = 2
) => {
  const units = new Map<string, TuneUnit>();
  const cells = new Map<string, Set<string>>();
  for (const f of features) {
    const id = f.id?.toString();
    if (!id || !f.sourceLayer) continue;
    if (!units.has(id)) {
      const pop = parseInt(f.properties?.total_pop_20);
      units.set(id, {id, sourceLayer: f.sourceLayer, pop: isNaN(pop) ? 0 : pop, zone: zoneOf(id)});
    }
    const g = f.geometry;
    const polygons =
      g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const polygon of polygons)
      for (const ring of polygon)
        for (const [x, y] of ring) {
          const key = `${Math.round(x / cell)},${Math.round(y / cell)}`;
          const ids = cells.get(key) ?? new Set<string>();
          ids.add(id);
          cells.set(key, ids);
        }
  }
  const sharedCells = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string) => {
    const row = sharedCells.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + 1);
    sharedCells.set(a, row);
  };
  for (const ids of cells.values()) {
    if (ids.size < 2) continue;
    const arr = Array.from(ids);
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++) {
        bump(arr[i], arr[j]);
        bump(arr[j], arr[i]);
      }
  }
  const neighbors = new Map<string, Set<string>>();
  sharedCells.forEach((row, id) =>
    neighbors.set(
      id,
      new Set(Array.from(row).flatMap(([n, count]) => (count >= minShared ? [n] : [])))
    )
  );
  return {units: Array.from(units.values()), neighbors};
};

// ponytail: triples are O(n²·log n); past this many moves, only the smallest
// units (the fine-tuning knobs) join triples.
const MAX_TRIPLE_MOVES = 600;

/**
 * Ranks ways to bring `target` to zero deviation with up to three boundary
 * moves: pull a neighbor's (or unassigned) unit in, push one of the target's
 * own units out to a neighboring district, or a mix (a swap). Ranked by
 * remaining error (whole people), then fewest units, then kindest to the
 * other districts touched.
 */
export const findTuneOptions = ({
  units,
  neighbors,
  target,
  deviations,
  canMove = () => true,
  limit = 100,
}: {
  units: TuneUnit[];
  neighbors: Map<string, Set<string>>;
  target: number;
  /** Signed deviation from ideal per district. */
  deviations: Map<number, number>;
  canMove?: (unit: TuneUnit, to: number) => boolean;
  limit?: number;
}): TuneOption[] => {
  const need = -(deviations.get(target) ?? 0);
  if (Math.abs(need) < 1) return [];
  const byId = new Map(units.map(u => [u.id, u]));

  const moves: Array<TuneMove & {v: number}> = [];
  for (const unit of units) {
    if (unit.pop <= 0) continue;
    const zones = new Set<number | null>();
    neighbors.get(unit.id)?.forEach(n => zones.add(byId.get(n)?.zone ?? null));
    if (unit.zone !== target) {
      if (zones.has(target) && canMove(unit, target)) moves.push({unit, to: target, v: unit.pop});
    } else {
      zones.forEach(z => {
        if (z !== null && z !== target && canMove(unit, z)) moves.push({unit, to: z, v: -unit.pop});
      });
    }
  }
  moves.sort((a, b) => a.v - b.v);

  const toOption = (ms: TuneMove[]): TuneOption => {
    const delta = new Map<number, number>();
    const add = (z: number, d: number) => delta.set(z, (delta.get(z) ?? 0) + d);
    for (const {unit, to} of ms) {
      add(to, unit.pop);
      if (unit.zone !== null) add(unit.zone, -unit.pop);
    }
    const after = new Map<number, number>();
    let collateral = 0;
    delta.forEach((d, z) => {
      const before = deviations.get(z) ?? 0;
      after.set(z, before + d);
      if (z !== target) collateral += Math.abs(before + d) - Math.abs(before);
    });
    const net = delta.get(target) ?? 0;
    return {moves: ms, net, error: Math.abs(need - net), after, collateral};
  };

  const found = new Map<string, TuneOption>();
  let best = Infinity;
  const consider = (ms: TuneMove[]) => {
    if (new Set(ms.map(m => m.unit.id)).size < ms.length) return;
    const key = ms
      .map(m => `${m.unit.id}>${m.to}`)
      .sort()
      .join(',');
    if (found.has(key)) return;
    const option = toOption(ms);
    found.set(key, option);
    best = Math.min(best, option.error);
  };
  // Indices in [from, list.length) whose v sits closest to x, one each side.
  const nearest = (list: typeof moves, x: number, from: number) => {
    let lo = from;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].v < x) lo = mid + 1;
      else hi = mid;
    }
    return [lo - 1, lo].filter(k => k >= from && k < list.length);
  };

  moves.forEach(m => consider([m]));
  moves.forEach((a, i) => nearest(moves, need - a.v, i + 1).forEach(k => consider([a, moves[k]])));

  const exactShort = Array.from(found.values()).filter(o => o.error < 1).length;
  // Triples can't outrank a full page of exact singles/pairs.
  if (exactShort < limit) {
    const pool =
      moves.length > MAX_TRIPLE_MOVES
        ? [...moves]
            .sort((a, b) => Math.abs(a.v) - Math.abs(b.v))
            .slice(0, MAX_TRIPLE_MOVES)
            .sort((a, b) => a.v - b.v)
        : moves;
    let triples = 0;
    outer: for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        for (const k of nearest(pool, need - pool[i].v - pool[j].v, j + 1)) {
          const ms = [pool[i], pool[j], pool[k]];
          const error = Math.abs(need - ms.reduce((s, m) => s + m.v, 0));
          if (error >= 1 && error > best) continue;
          consider(ms);
          // ponytail: stop once there's plenty to flip through.
          if (++triples >= limit * 5) break outer;
        }
  }

  return Array.from(found.values())
    .sort(
      (a, b) =>
        Math.floor(a.error) - Math.floor(b.error) ||
        a.moves.length - b.moves.length ||
        a.collateral - b.collateral ||
        a.error - b.error
    )
    .slice(0, limit);
};
