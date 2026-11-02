import {type NullableZone} from '@constants/map/zone';

/** A renumber's undo marker: the zone mapping (old -> new) plus the labels and
 * panel order before and after, since label cleanup can drop a label and the
 * mapping alone couldn't bring it back. */
export type ZoneRenumber = {
  mapping: ReadonlyMap<number, number>;
  before: ZoneRenumberLabels;
  after: ZoneRenumberLabels;
};
export type ZoneRenumberLabels = {zone_aliases: Record<string, string>; zone_order: number[]};

export type AssignmentsTemporalSnapshot = {
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  parentToChild: Map<string, Set<string>>;
  childToParent: Map<string, string>;
  zoneAssignments: Map<string, NullableZone>;
  clientLastUpdated: string;
  /** The latest renumber. Undo/redo compare it by identity to spot renumber steps. */
  lastZoneRenumber: ZoneRenumber | null;
};

/**
 * Deep clones an assignments temporal snapshot, creating new copies of all
 * nested Sets and Maps to prevent shared references across undo/redo states.
 * @param snapshot - The snapshot to clone.
 */
export const cloneTemporalSnapshot = (
  snapshot: AssignmentsTemporalSnapshot
): AssignmentsTemporalSnapshot => ({
  shatterIds: {
    parents: new Set(snapshot.shatterIds.parents),
    children: new Set(snapshot.shatterIds.children),
  },
  parentToChild: new Map(
    Array.from(snapshot.parentToChild.entries()).map(([parentId, children]) => [
      parentId,
      new Set(children),
    ])
  ),
  childToParent: new Map(snapshot.childToParent),
  zoneAssignments: new Map(snapshot.zoneAssignments),
  clientLastUpdated: snapshot.clientLastUpdated,
  // By reference: undo compares it by identity to spot renumber steps.
  lastZoneRenumber: snapshot.lastZoneRenumber,
});
