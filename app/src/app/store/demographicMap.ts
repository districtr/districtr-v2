import * as chromatic from 'd3-scale-chromatic';
import {useMapStore} from './mapStore';

export const DEFAULT_COLOR_SCHEME = ['#edf8fb', '#b2e2e2', '#66c2a4', '#2ca25f', '#006d2c'];

export const demographyVariables = [
  {
    label: 'Population: Total',
    value: 'total_pop',
    colorScheme: chromatic.schemeBuGn[5],
  },
  {
    label: 'Population: White',
    value: 'white_pop',
  },
  {
    label: 'Population: Black',
    value: 'black_pop',
  },
  {
    label: 'Population: Asian',
    value: 'asian_pop',
  },
  {
    label: 'Population: Native Hawaiian/Pacific Islander',
    value: 'nhpi_pop',
  },
  {
    label: 'Population: American Indian/Alaska Native',
    value: 'amin_pop',
  },
  {
    label: 'Population: Two or More Races',
    value: 'two_or_more',
  },
  {
    label: 'Population: Other',
    value: 'other_pop',
  },
  {
    label: 'Voting Population: Total',
    value: 'total_vap',
  },
  {
    label: 'Voting Population: White',
    value: 'non_hispanic_white_vap',
  },
  {
    label: 'Voting Population: Black',
    value: 'non_hispanic_black_vap',
  },
  {
    label: 'Voting Population: Hispanic',
    value: 'hispanic_vap',
  },
  {
    label: 'Voting Population: Asian',
    value: 'non_hispanic_asian_vap',
  },
  {
    label: 'Voting Population: Native Hawaiian/Pacific Islander',
    value: 'non_hispanic_nhpi_vap',
  },
  {
    label: 'Voting Population: American Indian/Alaska Native',
    value: 'non_hispanic_amin_vap',
  },
  {
    label: 'Voting Population: Two or More Races',
    value: 'non_hispanic_two_or_more_vap',
  },
  {
    label: 'Voting Population: Other',
    value: 'non_hispanic_other_vap',
  },
] as const;

export type DemographyVariable = (typeof demographyVariables)[number]['value'];
type DemographyPercentVariable = `${DemographyVariable}_percent`;
export type AllDemographyVariables = DemographyVariable | DemographyPercentVariable;

const vap_columns = demographyVariables
  .filter(f => f.value.endsWith('_vap') && f.value !== 'total_vap')
  .map(f => f.value);
const pop_columns = demographyVariables
  .filter(f => !f.value.endsWith('_vap') && f.value !== 'total_pop')
  .map(f => f.value);

export const getRowHandler = (columns: string[], childShatterIds: Set<string>) => {
  const indexMapping: Record<number, string> = {};
  const mapDocument = useMapStore.getState().mapDocument;
  columns.forEach((column, index) => {
    const colName = demographyVariables.find(f => f.value === column)?.value;
    if (colName) {
      indexMapping[index] = colName;
    }
  });
  return (row: number[]) => {
    const rowRecord: Record<AllDemographyVariables, number> & {path: string; sourceLayer: string, source: string} =
      {
        path: row[0],
        sourceLayer: childShatterIds.has(row[0].toString())
          ? mapDocument?.child_layer
          : mapDocument?.parent_layer,
      } as any;
    Object.entries(indexMapping).forEach(([index, column]) => {
      rowRecord[column as AllDemographyVariables] = row[+index] as number;
    });
    pop_columns.forEach(pop => {
      rowRecord[`${pop}_percent`] = rowRecord[pop] / rowRecord['total_pop'];
    });
    vap_columns.forEach(vap => {
      rowRecord[`${vap}_percent`] = rowRecord[vap] / rowRecord['total_vap'];
    });
    return rowRecord;
  };
};
