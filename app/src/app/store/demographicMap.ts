'use client';
import * as chromatic from 'd3-scale-chromatic';
import {MapStore, useMapStore} from './mapStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import maplibregl from 'maplibre-gl';
import * as scale from 'd3-scale'
import { demographyCache } from '../utils/demography/demographyCache';
import { fetchAssignments } from '../utils/api/queries';

export const DEFAULT_COLOR_SCHEME = chromatic.schemeBlues
export const DEFAULT_COLOR_SCHEME_GRAY = chromatic.schemeGreys;

export const demographyVariables = [
  {
    label: 'Population: Total',
    value: 'total_pop',
    models: ['P1'],
    colorScheme: chromatic.schemeBuGn,
  },
  {
    label: 'Population: White',
    value: 'white_pop',
    models: ['P1'],
  },
  {
    label: 'Population: Black',
    value: 'black_pop',
    models: ['P1'],
  },
  {
    label: 'Population: Asian',
    value: 'asian_pop',
    models: ['P1'],
  },
  {
    label: 'Population: Native Hawaiian/Pacific Islander',
    value: 'nhpi_pop',
    models: ['P1'],
  },
  {
    label: 'Population: American Indian/Alaska Native',
    value: 'amin_pop',
    models: ['P1'],
  },
  // {
  //   label: 'Population: Two or More Races',
  //   value: 'two_or_more',
  //   models: ['P1'],
  // },
  {
    label: 'Population: Other',
    value: 'other_pop',
    models: ['P1'],
  },
  {
    label: 'Voting Population: Total',
    value: 'total_vap',
    models: ['P4'],
  },
  {
    label: 'Voting Population: White',
    value: 'non_hispanic_white_vap',
    models: ['P4'],
  },
  {
    label: 'Voting Population: Black',
    value: 'non_hispanic_black_vap',
    models: ['P4'],
  },
  {
    label: 'Voting Population: Hispanic',
    value: 'hispanic_vap',
    models: ['P4'],
  },
  {
    label: 'Voting Population: Asian',
    value: 'non_hispanic_asian_vap',
    models: ['P4'],
  },
  {
    label: 'Voting Population: Native Hawaiian/Pacific Islander',
    value: 'non_hispanic_nhpi_vap',
    models: ['P4'],
  },
  {
    label: 'Voting Population: American Indian/Alaska Native',
    value: 'non_hispanic_amin_vap',
    models: ['P4'],
  },
  // {
  //   label: 'Voting Population: Two or More Races',
  //   value: 'non_hispanic_two_or_more_vap',
  //   models: ['P4'],
  // },
  {
    label: 'Voting Population: Other',
    value: 'non_hispanic_other_vap',
    models: ['P4'],
  },
] as const;

export type DemographyVariable = (typeof demographyVariables)[number]['value'];
export type DemographyPercentVariable = `${DemographyVariable}_pct`;
export type AllDemographyVariables = DemographyVariable | DemographyPercentVariable;
interface DemographyStore {
  getMapRef: () => maplibregl.Map | undefined;
  numberOfBins: number;
  setNumberOfBins: (numberOfBins: number) => void;
  setGetMapRef: (getMapRef: () => maplibregl.Map | undefined) => void;
  variable: AllDemographyVariables;
  setVariable: (variable: AllDemographyVariables) => void;
  dataHash: string;
  scale?: ReturnType<typeof scale.scaleThreshold>;
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
    setVariable: variable => set({variable}),
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
    setNumberOfBins: numberOfBins => set({numberOfBins}),
    dataHash: '',
    data: {},
    updateData: async (mapDocument, prevParentShatterIds) => {
      const {getMapRef, dataHash: currDataHash, setVariable, variable} = get();
      const {shatterMappings, shatterIds, zoneAssignments} = useMapStore.getState();
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
        .then(res => res?.json())
        .then(result => {
          result && demographyCache.update(
            result.columns,
            result.results,
            shatterIds.parents,
            shatterIds.children,
            mapDocument,
            dataHash
          )
      })
      // .catch(err => {
      //   console.error(err)
      //   const {setErrorNotification, mapDocument} = useMapStore.getState();
      //   setErrorNotification({
      //     message: 'Unable to get demographic data for this map.',
      //     severity: 2,
      //     id: `missing-demog-data-${mapDocument?.document_id}-${mapDocument?.gerrydb_table}`
      //   })
      //   return null;
      // });
      set({dataHash});
      if (mapRef){
        setVariable(variable)
      }
    },
  }))
);