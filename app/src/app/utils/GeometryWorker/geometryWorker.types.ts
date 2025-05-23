import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import {DocumentObject} from '../api/apiHandlers/types';

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
  /**
   * The maximum zoom level of the parent layer.
   */
  maxParentZoom: number;
  setMaxParentZoom: (zoom: number) => void;
  zoneAssignments: Record<string, number>;
  previousCentroids: Record<number, GeoJSON.Feature<GeoJSON.Point>>;
  /**
   * Updates the zone assignments of the geometries.
   * @param entries - An array of [id, zone] pairs to update.
   */
  updateZones: (entries: Array<[string, unknown]>) => void;
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
   * Convenience method for DRY of getCentroidsFromView
   * @param bounds number[] the view bounds
   * @returns CentroidReturn
   * @see getCentroidsFromView
   */
  getCentroidBoilerplate: (bounds: [number, number, number, number]) => {
    centroids: GeoJSON.FeatureCollection<GeoJSON.Point>;
    dissolved: GeoJSON.FeatureCollection;
    visitedZones: Set<number>;
    bboxGeom: GeoJSON.Polygon;
  };
  /**
   * Calculate the center of mass for a set of polygons
   *
   * @param geojson Set of polygons to calculate the center of mass for
   * @param bounds Bounds of the view
   * @param width Width of the subcanvas to render the polygons on. A higher number will result in a more accurate center of mass.
   * @param height Height of the subcanvas to render the polygons on. A higher number will result in a more accurate center of mass.
   * @returns [lng, lat] of the center of mass
   */
  computeCenterOfMass: (
    geojson: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    bounds: [number, number, number, number],
    width?: number,
    height?: number
  ) => Promise<[number, number] | null>;
  /**
   * Strategy for finding centroids by dissolving the zone geometries and finding the center of mass.
   * @param bounds number[] the view bounds
   * @param activeZones list of current drawn zones
   * @returns CentroidReturn
   * @see getCentroidsFromView
   */
  getCentersOfMass: (
    bounds: [number, number, number, number],
    activeZones: number[],
    canvasWidth?: number,
    canvasHeight?: number
  ) => Promise<CentroidReturn>;
  /**
   * Strategy for finding centroids choosing random centroids that do not intersect with each other
   * @param bounds number[] the view bounds
   * @param activeZones list of current drawn zones
   * @param minBuffer number minimum buffer distance between centroids in pixels
   * @returns CentroidReturn
   * @see getCentroidsFromView
   */
  getNonCollidingRandomCentroids: (
    bounds: [number, number, number, number],
    activeZones: number[],
    minBuffer?: number
  ) => Promise<CentroidReturn>;
  /**
   * Parses geometries within a specified view and returns their centroids.
   * @param minLon - The minimum longitude of the view.
   * @param minLat - The minimum latitude of the view.
   * @param maxLon - The maximum longitude of the view.
   * @param maxLat - The maximum latitude of the view.
   * @returns The centroids and dissolved outlines of the parsed features within the view.
   */
  getCentroidsFromView: (props: {
    bounds: [number, number, number, number];
    activeZones: number[];
    strategy: 'center-of-mass' | 'non-colliding-centroids';
    minBuffer?: number;
    canvasWidth?: number;
    canvasHeight?: number;
  }) => Promise<CentroidReturn>;
  /**
   * Retrieves the centroids of the geometries with the given IDs.
   * @param ids - The IDs of the geometries to retrieve.
   * @returns The centroids of the geometries.
   */
  getCentroidsByIds: (ids: string[]) => GeoJSON.FeatureCollection<GeoJSON.Point>;
  /**
   * The cached centroids of the geometries.
   */
  cachedCentroids: Record<string, GeoJSON.Feature<GeoJSON.Point>>;
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
