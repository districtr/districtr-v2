import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import {DocumentObject} from '../api/apiHandlers/types';

export type CentroidReturn = GeoJSON.FeatureCollection<GeoJSON.Point>;
export type MinGeoJSONFeature = Pick<
  MapGeoJSONFeature,
  'type' | 'geometry' | 'properties' | 'sourceLayer'
> & {
  zoom?: number;
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
  geometries: {[id: string]: MinGeoJSONFeature};
  activeGeometries: {[id: string]: MinGeoJSONFeature};
  shatterIds: {
    parents: string[];
    children: string[];
  };

  shouldGenerateOutlines: boolean;
  shouldGenerateCentroids: boolean;
  busy: boolean;
  geoOperationsTimeout: ReturnType<typeof setTimeout> | null;

  debouncedRunGeoOperations: (runAll?: boolean, debounce?: number) => void;
  runGeoOperations: (runAll?: boolean) => void;
  sendDataToMainThread:
    | ((data: {
        outlines?: GeoJSON.FeatureCollection;
        centroids?: GeoJSON.FeatureCollection;
      }) => void)
    | null;
  setSendDataCallback: (callback: GeometryWorkerClass['sendDataToMainThread']) => void;

  zoneAssignments: Record<string, number>;
  /**
   * Updates the zone assignments of the geometries.
   * @param entries - An array of [id, zone] pairs to update.
   */
  updateZones: (entries: Array<[string, number]>) => void;
  zoneUpdateLog: Record<
    string,
    {
      from: number;
      to: number;
    }
  >;

  viewbox: [number, number, number, number] | null;
  updateViewbox: (bounds: [number, number, number, number]) => void;

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
  /**
   * Retrieves the collection of geometries.
   * @returns The collection of geometries.
   */
  getGeos: () => GeoJSON.FeatureCollection;
  zoneMasses: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  updateMasses: () => GeometryResponse;
  updateCentroids: () => GeometryResponse;
};
