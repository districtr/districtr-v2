import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';

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
   * Point data for center of mass calculations.
   */
  pointData: GeoJSON.FeatureCollection<GeoJSON.Point>;
  /**
   * Sets the point data for center of mass calculations.
   * @param pointData - The point data to store.
   */
  setPointData: (pointData: GeoJSON.FeatureCollection<GeoJSON.Point>) => void;
  /**
   * Gets the point data for center of mass calculations.
   * @returns The stored point data.
   */
  getPointData: () => GeoJSON.FeatureCollection<GeoJSON.Point>;
  /**
   * Updates the zone assignments of the geometries.
   * @param entries - An array of [id, zone] pairs to update.
   */
  updateZones: (entries: Array<[string, unknown]>) => void;
  handleShatterHeal: (data: {parents: string[]; children: string[]}) => void;
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
   * Finds the median point for each zone.
   * @param bounds - The view bounds [minLon, minLat, maxLon, maxLat]
   * @param activeZones - List of current drawn zones
   * @returns CentroidReturn
   * @see getCentroidsFromView
   */
  getMedianPoint: (
    bounds: [number, number, number, number],
    activeZones: number[]
  ) => Promise<CentroidReturn>;
  /**
   * Parses point data within a specified view and returns their centroids.
   * Uses point data stored in the worker (set via setPointData).
   * @param bounds - The view bounds [minLon, minLat, maxLon, maxLat]
   * @param activeZones - List of current drawn zones
   * @param strategy - Strategy to use for centroid calculation
   * @returns The centroids and dissolved outlines of the parsed features within the view.
   */
  getCentroidsFromView: (props: {
    bounds: [number, number, number, number];
    activeZones: number[];
    strategy: 'median-point';
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
