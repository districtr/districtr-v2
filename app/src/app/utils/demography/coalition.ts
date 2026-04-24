import {AllTabularColumns} from '../api/summaryStats';
import {SUMMARY_TYPES, type CoalitionUniverse} from '@constants/demography/summary';
import {
  type CoalitionVariableKey,
  COALITION_VARIABLE_BY_UNIVERSE,
  COALITION_TOTAL_COLUMN_BY_UNIVERSE,
  COALITION_GROUPS,
  COALITION_LABEL,
  type CoalitionGroupKey,
} from '@constants/demography/coalition';

export const isCoalitionVariable = (variable: string): variable is CoalitionVariableKey =>
  variable === COALITION_VARIABLE_BY_UNIVERSE.TOTPOP ||
  variable === COALITION_VARIABLE_BY_UNIVERSE.VAP;

export const getCoalitionUniverseFromVariable = (
  variable: CoalitionVariableKey
): CoalitionUniverse =>
  variable === COALITION_VARIABLE_BY_UNIVERSE.TOTPOP ? SUMMARY_TYPES.TOTPOP : SUMMARY_TYPES.VAP;

export const getCoalitionGroupLabel = (group: CoalitionGroupKey): string =>
  COALITION_GROUPS.find(entry => entry.key === group)?.label ?? group;

export const getCoalitionColumn = (
  group: CoalitionGroupKey,
  universe: CoalitionUniverse
): AllTabularColumns[number] =>
  COALITION_GROUPS.find(entry => entry.key === group)?.columns[universe] ??
  COALITION_TOTAL_COLUMN_BY_UNIVERSE[universe];

export const getAvailableCoalitionGroups = (
  availableColumns: string[],
  universe: CoalitionUniverse
): CoalitionGroupKey[] =>
  COALITION_GROUPS.filter(group => availableColumns.includes(group.columns[universe])).map(
    group => group.key
  );

export const getMissingCoalitionGroups = (
  selectedGroups: CoalitionGroupKey[],
  availableColumns: string[],
  universe: CoalitionUniverse
): CoalitionGroupKey[] => {
  const available = new Set(getAvailableCoalitionGroups(availableColumns, universe));
  return selectedGroups.filter(group => !available.has(group));
};

export const getSelectedCoalitionColumns = ({
  selectedGroups,
  availableColumns,
  universe,
}: {
  selectedGroups: CoalitionGroupKey[];
  availableColumns: string[];
  universe: CoalitionUniverse;
}): Array<AllTabularColumns[number]> => {
  const available = new Set(availableColumns);
  return selectedGroups
    .map(group => getCoalitionColumn(group, universe))
    .filter(column => available.has(column));
};

export const getCoalitionLabel = ({
  selectedGroups,
  availableColumns,
  universe,
}: {
  selectedGroups: CoalitionGroupKey[];
  availableColumns: string[];
  universe: CoalitionUniverse;
}) => {
  const available = new Set(availableColumns);
  const availableSelected = selectedGroups.filter(group =>
    available.has(getCoalitionColumn(group, universe))
  );
  if (!availableSelected.length) return COALITION_LABEL;
  return `${COALITION_LABEL}: ${availableSelected.map(getCoalitionGroupLabel).join(' + ')}`;
};
