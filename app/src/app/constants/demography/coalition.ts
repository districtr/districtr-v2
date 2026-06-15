import {type AllTabularColumns} from '@utils/api/summaryStats';
import {type CoalitionUniverse} from '@constants/demography/summary';

export type CoalitionGroupKey = 'black' | 'hispanic' | 'amin' | 'asian' | 'white' | 'other';
export type CoalitionVariableKey = 'coalition_totpop' | 'coalition_vap';
export type DemographyVariable = AllTabularColumns[number] | CoalitionVariableKey;

type CoalitionGroupConfig = {
  key: CoalitionGroupKey;
  label: string;
  columns: {
    [K in CoalitionUniverse]: AllTabularColumns[number];
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
