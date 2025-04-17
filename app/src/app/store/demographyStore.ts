'use client';
import * as chromatic from 'd3-scale-chromatic';
import {MapStore, useMapStore} from './mapStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import maplibregl from 'maplibre-gl';
import * as scale from 'd3-scale';
import {updateDemography} from '../utils/api/queries';
import {PossibleColumnsOfSummaryStatConfig} from '../utils/api/summaryStats';
export const DEFAULT_COLOR_SCHEME = chromatic.schemeBlues;
export const DEFAULT_COLOR_SCHEME_GRAY = chromatic.schemeGreys;

export const demographyVariables: Array<{
  label: string;
  value: PossibleColumnsOfSummaryStatConfig[number];
  colorScheme?: typeof chromatic.schemeBlues;
}> = [
  {
    label: 'Population: Total',
    value: 'total_pop_20',
    colorScheme: chromatic.schemeBuGn,
  },
  {
    label: 'Population: Black',
    value: 'bpop_20',
  },
  {
    label: 'Population: Hispanic',
    value: 'hpop_20',
  },
  {
    label: 'Population: Asian',
    value: 'asian_nhpi_pop_20',
  },
  {
    label: 'Population: AMIN',
    value: 'amin_pop_20',
  },
  {
    label: 'Population: White',
    value: 'white_pop_20',
  },
  {
    label: 'Population: Other',
    value: 'other_pop_20',
  },
  {
    label: 'Voting Population: Total',
    value: 'total_vap_20',
  },
  {
    label: 'Voting Population: Black',
    value: 'bvap_20',
  },
  {
    label: 'Voting Population: Hispanic',
    value: 'hvap_20',
  },
  {
    label: 'Voting Population: Asian',
    value: 'asian_nhpi_vap_20',
  },
  {
    label: 'Voting Population: AMIN',
    value: 'amin_vap_20',
  },
  {
    label: 'Voting Population: White',
    value: 'white_vap_20',
  },
  {
    label: 'Voting Population: Other',
    value: 'other_vap_20',
  },
] as const;

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
  variable: PossibleColumnsOfSummaryStatConfig[number];

  /**
   * Sets the variable representing for the demographic map.
   * @param variable - The demographic variable to set - one of AllDemographicVariables.
   */
  setVariable: (variable: DemographyStore['variable']) => void;

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
  scale?: ReturnType<typeof scale.scaleThreshold<number, string>>;

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
   * Updates the demographic data based on the provided map document.
   * @param mapDocument - The map document from the main map.
   * @returns A promise that resolves when the data update is complete.
   */
  updateData: (mapDocument: MapStore['mapDocument']) => Promise<void>;
}

export var useDemographyStore = create(
  subscribeWithSelector<DemographyStore>((set, get) => ({
    getMapRef: () => undefined,
    setGetMapRef: getMapRef => {
      set({getMapRef});
      const {dataHash, setVariable, variable} = get();
      const {mapDocument, shatterIds} = useMapStore.getState();
      const currentDataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument?.document_id}`;
      if (currentDataHash === dataHash) {
        // set variable triggers map render/update
        getMapRef()?.on('load', () => {
          setVariable(variable);
        });
      }
    },
    variable: 'total_pop_20',
    setVariable: variable => set({variable}),
    scale: undefined,
    setScale: scale => set({scale}),
    clear: () => {
      set({
        scale: undefined,
        dataHash: '',
      });
    },
    unmount: () => {
      set({
        getMapRef: () => undefined,
        scale: undefined,
        dataHash: '',
      });
    },
    numberOfBins: 5,
    setNumberOfBins: numberOfBins => set({numberOfBins}),
    dataHash: '',
    setDataHash: dataHash => set({dataHash}),
    updateData: async mapDocument => {
      const {dataHash: currDataHash} = get();
      const {shatterIds} = useMapStore.getState();
      if (!mapDocument) return;
      // based on current map state
      const dataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument.document_id}`;
      if (currDataHash === dataHash) return;
      updateDemography({
        mapDocument,
        brokenIds: Array.from(shatterIds.parents),
        dataHash,
      });
    },
  }))
);
