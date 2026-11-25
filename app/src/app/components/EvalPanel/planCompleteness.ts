import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';

/** Districts that hold at least one unit; null when no metric reports them. */
export const drawnDistrictCount = (evaluation: DocumentEvaluation): number | null =>
  evaluation.competitiveness?.n_districts ??
  (evaluation.contiguous ? Object.keys(evaluation.contiguous).length : null);

/**
 * A plan is complete when every unit, or every block of a split unit, is assigned
 * and every one of the plan's districts holds at least one unit. Contiguity plays
 * no part. Null when the unit counts are missing; a missing district count leaves
 * the answer to the units.
 */
export const isPlanComplete = (
  evaluation: DocumentEvaluation,
  numDistricts: number | null | undefined
): boolean | null => {
  const assignedUnits = evaluation.assigned_units;
  if (assignedUnits == null) return null;
  const everyUnitAssigned =
    assignedUnits.assigned_count + (assignedUnits.split_count ?? 0) === assignedUnits.total_count &&
    assignedUnits.partially_assigned_count === 0;
  const drawn = drawnDistrictCount(evaluation);
  const everyDistrictDrawn = numDistricts == null || drawn === null || drawn >= numDistricts;
  return everyUnitAssigned && everyDistrictDrawn;
};
