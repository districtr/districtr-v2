import {MapGeoJSONFeature} from 'maplibre-gl';

export type CentroidReturn = {
  dissolved: GeoJSON.FeatureCollection;
  centroids: GeoJSON.FeatureCollection;
};
export type MinGeoJSONFeature = Pick<
  MapGeoJSONFeature,
  'type' | 'geometry' | 'properties' | 'sourceLayer'
>;
/**
 * Represents a class that handles geometry operations.
 */
export type GeometryWorkerClass = {
  /**
   * A collection of geometries indexed by their IDs.
   * Stored as JSON records to make updating zones faster.
   */
  geometries: {[id: string]: MinGeoJSONFeature};
  /**
   * Updates the zone assignments of the geometries.
   * @param entries - An array of [id, zone] pairs to update.
   */
  updateProps: (entries: Array<[string, unknown]>) => void;

  /**
   * Loads geometries from an array of features or a string.
   * @param features - The features to load. These should be formatted as a minimal version of the Maplibre MapGeoJSON Feature type or stringified version thereof.
   * @param idProp - The property to use as the ID.
   */
  loadGeometry: (features: MinGeoJSONFeature[] | string, idProp: string) => void;

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
  getCentroidsFromView: (
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number
  ) => CentroidReturn;

  /**
   * Retrieves the collection of geometries.
   * @returns The collection of geometries.
   */
  getGeos: () => GeoJSON.FeatureCollection;
};
