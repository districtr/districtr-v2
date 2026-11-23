import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';

/**
 * A plan is complete when every unit, or every block of a split unit, is assigned
 * to a district. Contiguity plays no part. Null when the unit counts are missing.
 */
export const isPlanComplete = (
  assignedUnits: DocumentEvaluation['assigned_units']
): boolean | null => {
  if (assignedUnits == null) return null;
  return (
    assignedUnits.assigned_count + (assignedUnits.split_count ?? 0) === assignedUnits.total_count &&
    assignedUnits.partially_assigned_count === 0
  );
};
