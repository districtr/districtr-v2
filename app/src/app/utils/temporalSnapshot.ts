import {type NullableZone} from '@constants/map/zone';

export type AssignmentsTemporalSnapshot = {
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  parentToChild: Map<string, Set<string>>;
  childToParent: Map<string, string>;
  zoneAssignments: Map<string, NullableZone>;
  clientLastUpdated: string;
  lastZoneRenumber: Map<number, number> | null;
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
  // Copied by reference: undo compares it by identity to spot renumber steps.
  lastZoneRenumber: snapshot.lastZoneRenumber,
});
