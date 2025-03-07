'use client';
import * as chromatic from 'd3-scale-chromatic';
import {MapStore, useMapStore} from './mapStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import maplibregl from 'maplibre-gl';
import * as scale from 'd3-scale'
import { demographyCache } from '../utils/demography/demographyCache';
import { updateDemography } from '../utils/api/queries';

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
  {
    label: 'Voting Population: Other',
    value: 'non_hispanic_other_vap',
    models: ['P4'],
  },
] as const;

export type DemographyVariable = (typeof demographyVariables)[number]['value'];
export type DemographyPercentVariable = `${DemographyVariable}_pct`;
export type AllDemographyVariables = DemographyVariable | DemographyPercentVariable;
/**
 * Zustand schema for managing demographic map data and operations.
 */
export interface DemographyStore {
  /**
   * Gets the reference to the MapLibre GL map instance.
   * @returns The MapLibre GL map instance or undefined if not set.
   */
  getMapRef: () => maplibregl.Map | undefined;

  /**
   * The number of bins used requested for the demographic map.
   */
  numberOfBins: number;

  /**
   * Sets the number of bins used for demographic data visualization.
   * @param numberOfBins - The number of bins to set.
   */
  setNumberOfBins: (numberOfBins: number) => void;

  /**
   * Sets the function to get the reference to the MapLibre GL map instance.
   * @param getMapRef - The function to get the map reference.
   */
  setGetMapRef: (getMapRef: () => maplibregl.Map | undefined) => void;

  /**
   * The variable for the demographic map.
   */
  variable: AllDemographyVariables;

  /**
   * Sets the variable representing for the demographic map.
   * @param variable - The demographic variable to set - one of AllDemographicVariables.
   */
  setVariable: (variable: AllDemographyVariables) => void;

  /**
   * The hash representing the most recent update of demographic data.
   * This is important because it triggers updates on otherwise non-tracked/non-reactive data.
   * This keeps the state small, but triggers updates when necessary.
   */
  dataHash: string;
  setDataHash: (dataHash: string) => void;
  /**
   * The d3 scale used for demographic data visualization.
   */
  scale?: ReturnType<typeof scale.scaleThreshold<number,string>>;

  /**
   * Sets the d3 scale used for demographic data visualization.
   * @param scale - The scale to set.
   */
  setScale: (scale: DemographyStore['scale']) => void;

  /**
   * Unmounts the demographic map and performs necessary cleanup.
   * This map can mount and unmount frequently,
   * so this is necessary to prevent memory leaks / etc.
   */
  unmount: () => void;

  /**
   * Like unmount, but retains the map ref.
   */
  clear: () => void;

  /**
   * Updates the demographic data based on the provided map document and optional previous shatter IDs.
   * When provided with shatterIds, it will only fetch data based on recently healed or newly shattered children.
   * @param mapDocument - The map document from the main map.
   * @param previousShatterIds - Optional previous shatter IDs for reference.
   * @returns A promise that resolves when the data update is complete.
   */
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
        // set variable triggers map render/update
        getMapRef()?.on('load', () => {
          setVariable(variable);
        })
      }
    },
    variable: 'total_pop',
    setVariable: variable => set({variable}),
    scale: undefined,
    setScale: scale => set({scale}),
    clear: () => {
      set({
        scale: undefined,
        dataHash: '',
      })
    },
    unmount: () => {
      set({
        getMapRef: () => undefined,
        scale: undefined,
        dataHash: '',
      })
    },
    numberOfBins: 5,
    setNumberOfBins: numberOfBins => set({numberOfBins}),
    dataHash: '',
    setDataHash: dataHash => set({dataHash}),
    updateData: async (mapDocument, prevParentShatterIds) => {
      const {dataHash: currDataHash} = get();
      const {shatterMappings, shatterIds} = useMapStore.getState();
      const prevShattered = prevParentShatterIds ?? new Set();
      if (!mapDocument) return;
      // based on current map state
      const dataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument.document_id}`;
      if (currDataHash === dataHash) return;
      const currentTableExists = demographyCache.table?.size;
      const newShatterChildren: string[] = []
      const currentShattered = Array.from(shatterIds.parents)
      const healedParents = Array.from(prevShattered).filter(id => !currentShattered.includes(id))
      // the table data ingestion dedupes and removes shattered parents
      // so this doesn't need to be *too* optimized
      shatterIds.parents.forEach(id => {
        if (!prevShattered?.has(id)) {
          newShatterChildren.push(...Array.from(shatterMappings[id]));
        }
      })
      let currRows = demographyCache.table?.size
      if (!currRows && !newShatterChildren.length && !healedParents.length) {
        // this is a full pull of the data
        demographyCache.clear();
      }
      updateDemography({
        document_id: mapDocument.document_id,
        ids: currentTableExists ? [...newShatterChildren, ...healedParents] : undefined,
        dataHash
      })
    },
  }))
);