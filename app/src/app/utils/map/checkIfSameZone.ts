import {NullableZone} from '@/app/constants/types';
/**
 * checkIfSameZone
 * Checks if all provided IDs belong to the same zone based on the zone assignments.
 *
 * @param {Set<string> | string[]} idsToCheck - A set or array of IDs to check against the zone assignments.
 * @param {Map<string, NullableZone>} zoneAssignments - A map of zone assignments where the key is the ID and the value is the assigned zone.
 * @returns {{ shouldHeal: boolean, zone: NullableZone | undefined }} - An object containing:
 *   - shouldHeal: A boolean indicating whether all IDs belong to the same zone.
 *   - zone: The zone that all IDs belong to, or undefined if no zone is assigned.
 */
export const checkIfSameZone = (
  idsToCheck: Set<string> | string[],
  zoneAssignments: Map<string, NullableZone>
) => {
  let zone: NullableZone | undefined = undefined;
  let shouldHeal = true;
  for (const id of idsToCheck) {
    const assigment = zoneAssignments.get(id);
    if (zone === undefined) {
      zone = assigment;
    }
    if (assigment !== undefined && assigment !== zone) {
      shouldHeal = false;
      break;
    }
  }
  return {
    shouldHeal,
    zone: zone || null,
  };
};
