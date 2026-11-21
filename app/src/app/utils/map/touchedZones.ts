import type {NullableZone} from '@constants/map/zone';

/** A plan's units: geo_id → district (null for unassigned), and each block of
 * a broken-up unit → that unit. */
export type PlanUnits = {
  zoneAssignments: Map<string, NullableZone>;
  childToParent: Map<string, string>;
};

/**
 * The districts a unit entered or left between two plans: both the old and the
 * new district of a unit that moved. A broken-up unit's blocks stand in for it,
 * so a break or heal by itself touches nothing, and a block painted away from
 * its unit's district touches both. A unit missing from a plan is unassigned
 * there.
 *
 * One pass over each plan: a few milliseconds at ~50k units, so it runs once
 * per change to the plan, never per pointer move.
 */
export function touchedZones(before: PlanUnits, after: PlanUnits): Set<number> {
  const touched = new Set<number>();
  const mark = (from: NullableZone | undefined, to: NullableZone | undefined) => {
    if ((from ?? null) === (to ?? null)) return;
    if (from != null) touched.add(from);
    if (to != null) touched.add(to);
  };
  // Units broken up in each plan; their blocks are compared in their place.
  const brokenBefore = new Set(before.childToParent.values());
  const brokenAfter = new Set(after.childToParent.values());
  after.zoneAssignments.forEach((zone, id) => {
    if (before.zoneAssignments.has(id)) return mark(before.zoneAssignments.get(id), zone);
    // Healed since: compared through its blocks, below.
    if (brokenBefore.has(id)) return;
    // A block of a unit broken since, against that unit; else newly painted.
    const parent = after.childToParent.get(id);
    mark(parent === undefined ? null : before.zoneAssignments.get(parent), zone);
  });
  before.zoneAssignments.forEach((zone, id) => {
    // Still there (compared above), or broken since (its blocks were).
    if (after.zoneAssignments.has(id) || brokenAfter.has(id)) return;
    // A block of a unit healed since, against that unit; else removed.
    const parent = before.childToParent.get(id);
    mark(zone, parent === undefined ? null : after.zoneAssignments.get(parent));
  });
  return touched;
}
