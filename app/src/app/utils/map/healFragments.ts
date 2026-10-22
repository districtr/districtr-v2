import {NullableZone, Zone} from '@constants/map/zone';
import type {ZoneConnectedComponent} from '../api/apiHandlers/getZoneConnectedComponents';

export type HealPlan = {
  /** geo_id -> district it moves to. */
  moves: Map<string, Zone>;
  byTarget: Array<{zone: Zone; units: number; population: number}>;
  /** Units left in place because this district, or every district they border, is locked. */
  skippedLocked: number;
  /** Units left in place because they border no other district. */
  skippedNoNeighbor: number;
  /** Units the server listed that the map no longer has in this zone. */
  skippedStale: number;
};

/**
 * Plan moving every fragment of `zone` (each component but the main body) into
 * the unlocked district it shares the most graph edges with. The main body is
 * the most populous component; without population data (popOf returns
 * undefined) it falls back to the first, i.e. the most units.
 */
export const planHeal = (
  zone: Zone,
  components: ZoneConnectedComponent[],
  zoneAssignments: Map<string, NullableZone>,
  lockedZones: NullableZone[],
  popOf: (id: string) => number | undefined
): HealPlan => {
  const pops = components.map(c => c.geo_ids.reduce((sum, id) => sum + (popOf(id) ?? 0), 0));
  const main = pops.reduce((best, pop, i) => (pop > pops[best] ? i : best), 0);
  const plan: HealPlan = {
    moves: new Map(),
    byTarget: [],
    skippedLocked: 0,
    skippedNoNeighbor: 0,
    skippedStale: 0,
  };
  const totals = new Map<Zone, {units: number; population: number}>();
  components.forEach((component, i) => {
    if (i === main) return;
    const ids = component.geo_ids.filter(id => zoneAssignments.get(id) === zone);
    plan.skippedStale += component.geo_ids.length - ids.length;
    if (!ids.length) return;
    const neighbors = Object.entries(component.neighbor_zones)
      .map(([z, edges]) => [Number(z), edges] as const)
      .sort((a, b) => b[1] - a[1]);
    const sourceLocked = lockedZones.includes(zone);
    const target = sourceLocked
      ? undefined
      : neighbors.find(([z]) => !lockedZones.includes(z))?.[0];
    if (target === undefined) {
      if (sourceLocked || neighbors.length) plan.skippedLocked += ids.length;
      else plan.skippedNoNeighbor += ids.length;
      return;
    }
    const total = totals.get(target) ?? {units: 0, population: 0};
    ids.forEach(id => {
      plan.moves.set(id, target);
      total.units++;
      total.population += popOf(id) ?? 0;
    });
    totals.set(target, total);
  });
  plan.byTarget = Array.from(totals, ([zone, t]) => ({zone, ...t})).sort((a, b) => a.zone - b.zone);
  return plan;
};
