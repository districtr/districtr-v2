import {ZoneAssignmentsMap} from '@/app/store/assignmentsStore';

/**
 * Sets zone assignments for child elements based on their parent's assignment.
 *
 * @param {MapStore['zoneAssignments']} zoneAssignments - The current map of zone assignments.
 * @param {string} parent - The ID of the parent element.
 * @param {string[]} children - An array of child element IDs.
 *
 * @description
 * This function checks if the parent has a zone assignment. If it does:
 * 1. It assigns the parent's zone to all the children.
 * 2. It removes the parent's zone assignment.
 * This is typically used when "shattering" a parent element into its constituent parts.
 */
export const setZones = (
  zoneAssignments: ZoneAssignmentsMap,
  parent: string,
  children: Set<string>
) => {
  const zone = zoneAssignments.get(parent) || null;
  children.forEach(childId => {
    zoneAssignments.set(childId, zone);
  });
  zoneAssignments.delete(parent);
};
