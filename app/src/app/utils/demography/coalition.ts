import {AllTabularColumns} from '../api/summaryStats';

export type CoalitionGroupKey = 'black' | 'hispanic' | 'amin' | 'asian' | 'white' | 'other';
export type CoalitionUniverse = 'TOTPOP' | 'VAP';
export type CoalitionVariableKey = 'coalition_totpop' | 'coalition_vap';
export type DemographyVariable = AllTabularColumns[number] | CoalitionVariableKey;

type CoalitionGroupConfig = {
  key: CoalitionGroupKey;
  label: string;
  columns: {
    TOTPOP: AllTabularColumns[number];
    VAP: AllTabularColumns[number];
  };
};

export const COALITION_GROUPS: CoalitionGroupConfig[] = [
  {key: 'black', label: 'Black', columns: {TOTPOP: 'bpop_20', VAP: 'bvap_20'}},
  {key: 'hispanic', label: 'Hispanic', columns: {TOTPOP: 'hpop_20', VAP: 'hvap_20'}},
  {key: 'amin', label: 'AMIN', columns: {TOTPOP: 'amin_pop_20', VAP: 'amin_vap_20'}},
  {
    key: 'asian',
    label: 'Asian',
    columns: {TOTPOP: 'asian_nhpi_pop_20', VAP: 'asian_nhpi_vap_20'},
  },
  {key: 'white', label: 'White', columns: {TOTPOP: 'white_pop_20', VAP: 'white_vap_20'}},
  {key: 'other', label: 'Other', columns: {TOTPOP: 'other_pop_20', VAP: 'other_vap_20'}},
];

export const COALITION_VARIABLE_BY_UNIVERSE: Record<CoalitionUniverse, CoalitionVariableKey> = {
  TOTPOP: 'coalition_totpop',
  VAP: 'coalition_vap',
};

export const COALITION_TOTAL_COLUMN_BY_UNIVERSE: Record<
  CoalitionUniverse,
  AllTabularColumns[number]
> = {
  TOTPOP: 'total_pop_20',
  VAP: 'total_vap_20',
};

export const COALITION_LABEL = 'Coalition';

export const isCoalitionVariable = (variable: string): variable is CoalitionVariableKey =>
  variable === COALITION_VARIABLE_BY_UNIVERSE.TOTPOP ||
  variable === COALITION_VARIABLE_BY_UNIVERSE.VAP;

export const getCoalitionUniverseFromVariable = (
  variable: CoalitionVariableKey
): CoalitionUniverse => (variable === 'coalition_totpop' ? 'TOTPOP' : 'VAP');

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
  const availableSelected = selectedGroups.filter(
    group =>
      getSelectedCoalitionColumns({
        selectedGroups: [group],
        availableColumns,
        universe,
      }).length
  );
  if (!availableSelected.length) return COALITION_LABEL;
  return `${COALITION_LABEL}: ${availableSelected.map(getCoalitionGroupLabel).join(' + ')}`;
};
