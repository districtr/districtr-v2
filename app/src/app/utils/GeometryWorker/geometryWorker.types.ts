import {LngLatBoundsLike} from 'maplibre-gl';
import {DocumentObject} from '../api/apiHandlers/types';
import {type geos as GeosType} from 'geos-wasm';

export type CentroidReturn = GeoJSON.FeatureCollection<GeoJSON.Point>;
export type SendDataToMainThread =
  | ((data: {outlines?: GeoJSON.FeatureCollection; centroids?: GeoJSON.FeatureCollection}) => void)
  | null;

export type GeometryPointer = number;
export type GeometryInfo = {
  zoom?: number;
  sourceLayer?: string;
  properties?: Record<string, any>;
  geometry: GeometryPointer;
};

export type GeometryResponse =
  | {
      ok: true;
      data: GeoJSON.FeatureCollection;
    }
  | {
      ok: false;
      error: string;
    };
/**
 * Represents a class that handles geometry operations.
 */
export type GeometryWorkerClass = {
  /**
   * A collection of geometries indexed by their IDs.
   * Stored as JSON records to make updating zones faster.
   */
  geometries: {[id: string]: GeometryInfo};
  activeGeometries: {[id: string]: GeometryInfo};
  shatterIds: {
    parents: string[];
    children: string[];
  };

  shouldGenerateOutlines: boolean;
  shouldGenerateCentroids: boolean;
  busy: boolean;
  geoOperationsTimeout: ReturnType<typeof setTimeout> | null;

  debouncedRunGeoOperations: (
    runAll?: boolean,
    debounce?: number,
    context?: GeometryWorkerClass
  ) => void;
  runGeoOperations: (runAll?: boolean) => void;
  setSendDataCallback: (callback: SendDataToMainThread) => void;

  zoneAssignments: Record<string, number>;
  zonesChanged: Set<number>;
  /**
   * Updates the zone assignments of the geometries.
   * @param entries - An array of [id, zone] pairs to update.
   */
  updateZones: (entries: Array<[string, number]>) => void;

  viewbox: [number, number, number, number] | null;
  updateViewbox: (bounds: number[]) => void;

  handleShatterHeal: (data: {parents: string[]; children: string[]}) => void;
  loadedTiles: Set<string>;
  loadTileData: (data: {
    tileData: Uint8Array;
    tileID: {x: number; y: number; z: number};
    mapDocument: DocumentObject;
    idProp: string;
  }) => void;
  /**
   * Removes geometries from the collection.
   * @param ids - The IDs of the geometries to remove.
   */
  removeGeometries: (ids: string[]) => void;
  /**
   * Clears the collection of geometries.
   */
  clear: () => void;
  resetZones: () => void;
  getUnassignedGeometries: (
    documentId?: string,
    exclude_ids?: string[]
  ) => Promise<{
    dissolved: GeoJSON.FeatureCollection;
    overall: LngLatBoundsLike | null;
  }>;
  zoneMasses: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  updateMasses: () => GeometryResponse;
  updateCentroids: () => GeometryResponse;
  getZoneGeometries: (
    geos: GeosType,
    currentZones: Set<number>
  ) => Array<{
    zone: number;
    geometry: GeometryPointer;
  }>;
};
