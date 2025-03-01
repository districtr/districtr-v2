'use client';
import * as chromatic from 'd3-scale-chromatic';
import {MapStore, useMapStore} from './mapStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import maplibregl from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '../constants/layers';
import * as scale from 'd3-scale'
import { demographyCache } from '../utils/demography/demographyCache';

export const DEFAULT_COLOR_SCHEME = chromatic.schemeBlues
export const DEFAULT_COLOR_SCHEME_GRAY = chromatic.schemeGreys;

export const demographyVariables = [
  {
    label: 'Population: Total',
    value: 'total_pop',
    colorScheme: chromatic.schemeBuGn,
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
type DemographyPercentVariable = `${DemographyVariable}_pct`;
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
      rowRecord[`${pop}_pct`] = rowRecord[pop] / rowRecord['total_pop'];
    });
    vap_columns.forEach(vap => {
      rowRecord[`${vap}_pct`] = rowRecord[vap] / rowRecord['total_vap'];
    });
    return rowRecord;
  };
};


interface DemographyStore {
  getMapRef: () => maplibregl.Map | undefined;
  numberOfBins: number;
  setNumberOfBins: (numberOfBins: number) => void;
  customBins: number[];
  setCustomBins: (customBins: number[]) => void;
  setGetMapRef: (getMapRef: () => maplibregl.Map | undefined) => void;
  variable: AllDemographyVariables;
  setVariable: (variable: AllDemographyVariables) => void;
  dataHash: string;
  scale?: ReturnType<typeof scale.scaleQuantile>;
  setScale: (scale: DemographyStore['scale']) => void;
  unmount: () => void;
  clear: () => void;
  updateData: (
    mapDocument: MapStore['mapDocument'],
    previousShatterIds?: MapStore['shatterIds']['parents']
  ) => Promise<void>;
}

export var useDemographyStore = create(
  subscribeWithSelector<DemographyStore>((set, get) => ({
    getMapRef: () => undefined,
    setGetMapRef: getMapRef => {
      set({getMapRef})
      const {dataHash, setVariable, variable} = get();
      const {mapDocument, shatterIds} = useMapStore.getState();
      const currentDataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument?.document_id}`;
      if (currentDataHash === dataHash) {
        setTimeout(() => {
          setVariable(variable);
        }, 500);
      }
    },
    variable: 'total_pop',
    setVariable: variable => set({variable, customBins: []}),
    scale: undefined,
    setScale: scale => set({scale}),
    clear: () => {
      set({
        variable: 'total_pop',
        scale: undefined,
        dataHash: '',
      })
    },
    unmount: () => {
      set({
        getMapRef: () => undefined,
        variable: 'total_pop',
        scale: undefined,
        dataHash: '',
      })
    },
    numberOfBins: 5,
    setNumberOfBins: numberOfBins => set({numberOfBins, customBins: []}),
    customBins: [],
    setCustomBins: customBins => set({customBins}),
    dataHash: '',
    data: {},
    updateData: async (mapDocument, prevParentShatterIds) => {
      const {getMapRef, dataHash: currDataHash, setVariable, variable} = get();
      const {shatterMappings, shatterIds} = useMapStore.getState();
      const mapRef = getMapRef();
      const prevShattered = prevParentShatterIds ?? new Set();
      if (!mapDocument) return;
      const dataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument.document_id}`;
      if (currDataHash === dataHash) return;
      const shatterChildren: string[] = []
      const newShatterChildren: string[] = []
      const oldParentsHealed = Array.from(prevShattered).filter(f => !shatterIds.parents.has(f));

      shatterIds.parents.forEach(id => {
        if (!prevShattered?.has(id)) {
          newShatterChildren.push(...Array.from(shatterMappings[id]));
        }
        shatterChildren.push(...Array.from(shatterMappings[id]));
      })
      let currRows = demographyCache.table?.size

      const fetchUrl = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/demography`)
      if (currRows && (shatterIds.parents.size || prevShattered?.size)) {
        [...newShatterChildren, ...oldParentsHealed].forEach(id => {
          fetchUrl.searchParams.append('ids', id)
        })
      } else {
        // This is a full pull of the data
        demographyCache.clear();
      }

      await fetch(fetchUrl.toString())
        .then(res => res.json())
        .then(result => {
          demographyCache.update(
            result.columns,
            result.results,
            shatterIds.parents,
            shatterIds.children,
            mapDocument,
            dataHash
          )
      });
      set({dataHash});
      if (mapRef){
        setVariable(variable)
      }
    },
  }))
);