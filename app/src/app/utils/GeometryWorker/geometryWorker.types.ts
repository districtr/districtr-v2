import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import {DocumentObject} from '../api/apiHandlers';

export type CentroidReturn = {
  dissolved: GeoJSON.FeatureCollection;
  centroids: GeoJSON.FeatureCollection;
};
export type MinGeoJSONFeature = Pick<
  MapGeoJSONFeature,
  'type' | 'geometry' | 'properties' | 'sourceLayer'
> & {
  zoom?: number;
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
  previousCentroids: Record<number, GeoJSON.Feature<GeoJSON.Point>>;
  /**
   * Updates the zone assignments of the geometries.
   * @param entries - An array of [id, zone] pairs to update.
   */
  updateProps: (entries: Array<[string, unknown]>, iters?: number) => void;
  handleShatterHeal: (data: {parents: string[]; children: string[]}) => void;
  /**
   * Loads geometries from an array of features or a string.
   * @param features - The features to load. These should be formatted as a minimal version of the Maplibre MapGeoJSON Feature type or stringified version thereof.
   * @param idProp - The property to use as the ID.
   */
  loadGeometry: (features: MinGeoJSONFeature[] | string, idProp: string) => void;
  loadTileData: (data: {
    tileData: Uint8Array;
    tileID: {x: number; y: number; z: number};
    mapDocument: DocumentObject;
    idProp: string;
  }) => Array<MinGeoJSONFeature>;
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
  /**
   * Parses geometries and returns their centroids.
   * @param features - The features to parse.
   * @returns The centroids and dissolved outlines of the parsed features.
   */
  dissolveGeometry: (features: MinGeoJSONFeature[]) => CentroidReturn;

  /**
   * Parses geometries within a specified view and returns their centroids.
   * @param minLon - The minimum longitude of the view.
   * @param minLat - The minimum latitude of the view.
   * @param maxLon - The maximum longitude of the view.
   * @param maxLat - The maximum latitude of the view.
   * @returns The centroids and dissolved outlines of the parsed features within the view.
   */
  getCentroidsFromView: (props: {
    bounds: [number, number, number, number],
    activeZones: number[],
    fast?: boolean,
    minBuffer?: number
  }) => CentroidReturn;
  getPropertiesCentroids: (ids: string[]) => GeoJSON.FeatureCollection<GeoJSON.Point>;
  /**
   * Retrieves a collection of geometries without a zone assignment.
   * @returns The collection of unassigned geometries.
   */
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
  getPropsById: (ids: string[]) => Array<MinGeoJSONFeature>;
};
