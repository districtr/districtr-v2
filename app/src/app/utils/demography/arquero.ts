'use client';
import {op, escape} from 'arquero';
import {
  possibleRollups,
  DemographyRow,
} from '../api/summaryStats';


/**
 * Generates a record of functions that calculate the percentage of various demographic populations.
 * Each function takes a `DemographyRow` object and returns a number representing the percentage
 * of a specific population group relative to the total population or total voting age population.
 * This is required for the way Arquero handles deriving columns and is somewhat fussy.
 *
 * @param columns - An array of column names to derive.
 *
 * @returns A record where keys are demographic percentage identifiers and values are functions
 *          that calculate the respective percentages.
 *
 * If the corresponding data is not available (as indicated by the `stats` parameter), the function will return `NaN`.
 */
export const getPctDerives = (
  columns: string[]
) => {
  const derives: Record<string, object> = {};
  possibleRollups.forEach(rollup => {
    if (columns.includes(rollup.col)) {
      derives[rollup.col + '_pct'] = escape((row: DemographyRow) => row[rollup.col] / row[rollup.total]);
    }
  });
  return derives;
};

/**
 * Generates an object containing the summary rollup values for the given statistics.
 * Rollup functions, unlike Derives in Arquero, can be programmatically generated.
 *
 * @param columns - An array of column names to rollup.
 * @param type - The type of rollup to perform.
 * @returns An object containing the rollup values for each column.
 */
export const getRollups = (columns: string[], type: 'sum' | 'max' = 'sum') => {
  const rollups: Record<string, ReturnType<typeof op.sum>> = {};
  possibleRollups.forEach(rollup => {
    if (columns.includes(rollup.col)) {
      rollups[rollup.col] = op[type](rollup.col);
    }
  });
  return rollups;
};