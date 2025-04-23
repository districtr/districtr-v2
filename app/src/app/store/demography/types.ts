import {
  AllEvaluationConfigs,
  AllMapConfigs,
  EvalColumnConfiguration,
  summaryStatsConfig,
  type AllTabularColumns,
} from '@/app/utils/api/summaryStats';
import {type ScaleLinear, type ScaleThreshold} from 'd3-scale';
import {type MapStore} from '../mapStore';

export type AnyD3Scale = ScaleLinear<number, string> | ScaleThreshold<number, string>;

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
  variable: AllTabularColumns[number];

  /**
   * Sets the variable representing for the demographic map.
   * @param variable - The demographic variable to set - one of AllDemographicVariables.
   */
  setVariable: (variable: DemographyStore['variable']) => void;

  variant: 'percent' | 'raw';
  setVariant: (variant: DemographyStore['variant']) => void;
  availableColumnSets: {
    evaluation: Record<string, AllEvaluationConfigs>;
    map: Record<string, AllMapConfigs>;
  };
  setAvailableColumnSets: (columnSets: Partial<DemographyStore['availableColumnSets']>) => void;
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
  scale?: AnyD3Scale;

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
