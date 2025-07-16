import {area, polygon} from '@turf/turf';
import type {Position} from 'geojson';
export const GEO_OPERATION_TIMEOUT = 1000;
export const GEO_OPERATION_DEBOUNCE_SHORT = 100;
export const MAX_CENTROID_RETRIES = 1000;
export const GEO_CLEANUP_BUFFER_IN_M = 20;

export const getArea = (coordinates: Position[]) => {
  return area(polygon([coordinates]));
};

export const removeHoles = (
  coordinates: GeoJSON.Polygon['coordinates'] | GeoJSON.MultiPolygon['coordinates'],
  type: 'Polygon' | 'MultiPolygon',
  minArea: number = 100
): GeoJSON.Polygon['coordinates'] | GeoJSON.MultiPolygon['coordinates'] => {
  if (type === 'Polygon') {
    // Polygon
    const hasHoles = coordinates.length > 1;
    if (hasHoles) {
      const cleaned = coordinates.filter((c, i) => i === 0 || getArea(c) > minArea);
      console.log('cleaned', cleaned);
      console.log('coordinates', coordinates);
      return cleaned;
    } else {
      return coordinates;
    }
  } else {
    return (coordinates as GeoJSON.MultiPolygon['coordinates']).map(c =>
      removeHoles(c, 'Polygon', minArea)
    ) as GeoJSON.MultiPolygon['coordinates'];
  }
};

export const recursiveFindNotArray = (obj: Array<any> | unknown) => {
  if (Array.isArray(obj) && obj.length > 0) {
    return obj.some(recursiveFindNotArray);
  } else if (Array.isArray(obj) && obj.length === 0) {
    return false;
  }
  return true;
};
/**
 * Round a single number to the nearest multiple of 1/factor.
 */
const qValue = (v: number, factor: number) => Math.round(v * factor) / factor;

/**
 * Recursively quantise any GeoJSON coordinate array.
 * Handles Point, LineString, Polygon, Multi* the same way.
 */
const qCoords = (coords: any, factor: number): any =>
  typeof coords[0] === 'number'
    ? coords.map((d: number) => qValue(d, factor))
    : coords.map((c: any) => qCoords(c, factor));

/**
 * Quantise a GeoJSON geometry object (in-place copy).
 */
const qGeometry = (geom: GeoJSON.Geometry, factor: number): GeoJSON.Geometry => ({
  ...geom,
  // @ts-expect-error
  coordinates: qCoords(geom.coordinates, factor),
});

/**
 * Quantise a single Feature or an entire FeatureCollection.
 * Anything else is returned unchanged.
 */
export const quantizeGeoJSON = <T extends GeoJSON.GeoJsonObject>(
  input: T,
  factor: number = 1e6
): T => {
  if (input.type === 'Feature') {
    // @ts-expect-error
    const f = input as GeoJSON.Feature;
    // @ts-expect-error
    return {
      ...f,
      geometry: qGeometry(f.geometry, factor),
    } as T;
  }

  if (input.type === 'FeatureCollection') {
    // @ts-expect-error
    const fc = input as GeoJSON.FeatureCollection;
    // @ts-expect-error
    return {
      ...fc,
      features: fc.features.map(f => ({
        ...f,
        geometry: qGeometry(f.geometry, factor),
      })),
    } as T;
  }

  // Geometry object passed directly
  if ('coordinates' in input) {
    // @ts-expect-error
    return qGeometry(input as GeoJSON.Geometry, factor) as T;
  }

  return input; // Unsupported object (e.g. Topology) – leave unchanged
};

export const explodeMultiPolygonToPolygons = (
  feature: GeoJSON.MultiPolygon
): Array<GeoJSON.Feature<GeoJSON.Polygon>> => {
  return feature.coordinates.map(coords => ({
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coords,
    },
  })) as Array<GeoJSON.Feature<GeoJSON.Polygon>>;
};
