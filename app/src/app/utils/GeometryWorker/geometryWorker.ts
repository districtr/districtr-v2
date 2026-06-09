import {expose} from 'comlink';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import {LngLatBoundsLike} from 'maplibre-gl';
import nearestPoint from '@turf/nearest-point';
import polylabel from 'polylabel';
import {EMPTY_FT_COLLECTION} from '../../constants/map/layerStyle';
import {getMsgpack} from '../api/msgpack';

const POINT_LIMIT = 256;
const MIN_POPULATION = 300;

/**
 * Find the visual center (pole of inaccessibility) of a polygon.
 * For MultiPolygons, uses the largest component polygon.
 */
const interiorCenter = (
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): GeoJSON.Feature<GeoJSON.Point> => {
  const geom = feature.geometry;
  let rings: number[][][];

  if (geom.type === 'Polygon') {
    rings = geom.coordinates;
  } else {
    // Pick the largest polygon by outer ring area
    let maxArea = 0;
    rings = geom.coordinates[0];
    for (const polyCoords of geom.coordinates) {
      let area = 0;
      const outer = polyCoords[0];
      for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
        area += (outer[j][0] - outer[i][0]) * (outer[j][1] + outer[i][1]);
      }
      if (Math.abs(area) > maxArea) {
        maxArea = Math.abs(area);
        rings = polyCoords;
      }
    }
  }

  const result = polylabel(rings, 0.001);
  const [x, y] = [result[0], result[1]];
  return {
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [x, y]},
    properties: {},
  };
};

const GeometryWorker: GeometryWorkerClass = {
  geometries: {},
  activeGeometries: {},
  zoneAssignments: {},
  cachedCentroids: {},
  pointData: EMPTY_FT_COLLECTION,
  shatterIds: {
    parents: [],
    children: [],
  },
  setMaxParentZoom(zoom) {
    this.maxParentZoom = zoom;
  },
  maxParentZoom: 0,
  previousCentroids: {},
  setPointData(pointData: GeoJSON.FeatureCollection<GeoJSON.Point>) {
    this.pointData = pointData;
  },
  getPointData(): GeoJSON.FeatureCollection<GeoJSON.Point> {
    return this.pointData;
  },
  childPointData: EMPTY_FT_COLLECTION,
  setChildPointData(pointData: GeoJSON.FeatureCollection<GeoJSON.Point>) {
    this.childPointData = pointData;
  },
  getPropsById(ids: string[]) {
    const features: MinGeoJSONFeature[] = [];
    ids.forEach(id => {
      const f = this.geometries[id];
      if (f) {
        features.push({
          ...f,
          geometry: undefined as any,
        });
      }
    });
    return features;
  },
  getGeos() {
    return {
      type: 'FeatureCollection',
      features: Object.values(this.activeGeometries),
    };
  },
  updateZones(entries) {
    this.zoneAssignments = entries.reduce(
      (acc, [id, zone]) => {
        acc[id] = zone as number;
        return acc;
      },
      {} as Record<string, number>
    );
  },
  handleShatterHeal({parents, children}) {
    const toAdd = [
      ...this.shatterIds.parents.filter(id => !parents.includes(id)),
      ...children.filter(id => !this.shatterIds.children.includes(id)),
    ];
    const toRemove = [
      ...this.shatterIds.children.filter(id => !children.includes(id)),
      ...parents.filter(id => !this.shatterIds.parents.includes(id)),
    ];
    toAdd.forEach(id => {
      this.geometries[id] && (this.activeGeometries[id] = this.geometries[id]);
    });
    toRemove.forEach(id => {
      this.activeGeometries[id] && delete this.activeGeometries[id];
    });
    this.shatterIds = {
      parents,
      children,
    };
    console.log('SHATTERED', this.shatterIds, this.activeGeometries);
  },
  removeGeometries(ids) {
    ids.forEach(id => {
      delete this.geometries[id];
    });
  },
  clear() {
    this.geometries = {};
    this.activeGeometries = {};
    this.previousCentroids = {};
    this.cachedCentroids = {};
    this.shatterIds = {
      parents: [],
      children: [],
    };
    this.childPointData = EMPTY_FT_COLLECTION;
  },
  resetZones() {
    this.zoneAssignments = {};
  },
  getCentroidBoilerplate(bounds) {
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const visitedZones = new Set<number>();
    const centroids: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: [],
    };
    const dissolved: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    const bboxGeom: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [minLon, minLat],
          [minLon, maxLat],
          [maxLon, maxLat],
          [maxLon, minLat],
          [minLon, minLat],
        ],
      ],
    };
    return {
      centroids,
      dissolved,
      visitedZones,
      bboxGeom,
    };
  },
  async getMedianPoint(bounds: [number, number, number, number], activeZones: number[]) {
    const pointData = this.pointData;
    const {centroids, dissolved} = this.getCentroidBoilerplate(bounds);
    if (!activeZones.length || !pointData?.features?.length) {
      return {
        centroids,
        dissolved,
      };
    }
    const [minLon, minLat, maxLon, maxLat] = bounds;

    // Group points by zone and filter by bounds
    const zonePoints: Record<number, GeoJSON.Feature<GeoJSON.Point>[]> = {};
    const coords: Record<number, {lng: number[]; lat: number[]}> = {};

    pointData.features.forEach(point => {
      const id = point.properties?.path;
      if (!id) return;
      const zone = this.zoneAssignments[id];
      if (zone === null || zone === undefined || !activeZones.includes(zone)) return;
      // Limit 64 points per zone
      if (zonePoints[zone]?.length >= POINT_LIMIT) return;
      const [lng, lat] = point.geometry.coordinates;
      // Filter points within bounds
      if (lng < minLon || lng > maxLon || lat < minLat || lat > maxLat) return;
      if (point.properties?.total_pop_20 < MIN_POPULATION && zonePoints[zone]?.length > 0) return;

      if (!zonePoints[zone]) {
        zonePoints[zone] = [];
        coords[zone] = {lng: [], lat: []};
      }
      zonePoints[zone].push(point);
      coords[zone].lng.push(lng);
      coords[zone].lat.push(lat);
    });

    // For each zone, create bbox around points and find nearest point to center
    Object.entries(zonePoints).forEach(([zoneStr, points]) => {
      if (!points.length) return;
      const zone = +zoneStr;

      // Create a FeatureCollection from the zone's points
      const zonePointCollection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: 'FeatureCollection',
        features: points,
      };
      const medianLat = coords[zone].lat.sort((a, b) => a - b)[
        Math.floor(coords[zone].lat.length / 2)
      ];
      const medianLng = coords[zone].lng.sort((a, b) => a - b)[
        Math.floor(coords[zone].lng.length / 2)
      ];
      const targetPoint: GeoJSON.Feature<GeoJSON.Point> = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [medianLng, medianLat],
        },
        properties: {},
      };
      const nearest = nearestPoint(targetPoint, zonePointCollection);

      if (nearest) {
        centroids.features.push({
          type: 'Feature',
          properties: {zone},
          geometry: nearest.geometry,
        } as GeoJSON.Feature<GeoJSON.Point>);
      }
    });

    return {
      centroids,
      dissolved,
    };
  },
  async getCentroidsFromView({bounds, activeZones, strategy = 'median-point'}) {
    switch (strategy) {
      case 'median-point':
        return await this.getMedianPoint(bounds, activeZones);
      default:
        return await this.getMedianPoint(bounds, activeZones);
    }
  },
  getCentroidsByIds(ids) {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    let missingIds = [];
    ids.forEach(id => {
      const f = this.geometries[id];
      if (f) {
        if (this.cachedCentroids[id]) {
          features.push(this.cachedCentroids[id]);
        } else {
          let center = centerOfMass(f);
          center.properties = f.properties;
          features.push(center);
          this.cachedCentroids[id] = center;
        }
      } else {
        missingIds.push(id);
      }
    });
    console.log(`Missing ${missingIds.length} geometries for centroid labels.`);
    return {
      type: 'FeatureCollection',
      features,
    };
  },
  setPublicFeatures(features: GeoJSON.Feature[]) {
    const points: GeoJSON.Feature<GeoJSON.Point>[] = [];
    const zoneEntries: Array<[string, number]> = [];

    features.forEach(feature => {
      const zone = feature.properties?.zone;
      const path = feature.properties?.path;
      if (zone == null || !path || !feature.geometry) return;

      const poly = feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      const center = interiorCenter(poly);
      const [lng, lat] = center.geometry.coordinates;
      points.push({
        type: 'Feature',
        geometry: center.geometry,
        properties: {
          ...feature.properties,
          x: lng,
          y: lat,
        },
      });
      zoneEntries.push([String(path), zone]);
    });

    this.pointData = {
      type: 'FeatureCollection',
      features: points,
    };
    this.updateZones(zoneEntries);
  },
  async getUnassignedGeometries(documentId?: string, exclude_ids?: string[]) {
    const empty = {
      dissolved: {type: 'FeatureCollection' as const, features: []},
      overall: null,
    };
    const result = await getMsgpack<{components: string[][]}>(
      `document/${documentId}/unassigned`,
      exclude_ids?.length ? {exclude_ids} : undefined
    );
    if (!result.ok || !result.response?.components?.length) {
      return empty;
    }

    // Index centroids by geo_id from both parent and child point sets.
    const centroidById: Record<string, [number, number]> = {};
    const indexPoints = (fc: GeoJSON.FeatureCollection<GeoJSON.Point>) => {
      fc.features.forEach(f => {
        const path = f.properties?.path;
        if (path && f.geometry.coordinates.length >= 2) {
          centroidById[path] = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
        }
      });
    };
    indexPoints(this.pointData);
    indexPoints(this.childPointData);

    const componentFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
    let oMinX = Infinity;
    let oMinY = Infinity;
    let oMaxX = -Infinity;
    let oMaxY = -Infinity;

    for (const component of result.response.components) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let hits = 0;
      for (const id of component) {
        const c = centroidById[id];
        if (!c) continue;
        hits++;
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
      }
      if (!hits) continue;

      if (minX < oMinX) oMinX = minX;
      if (maxX > oMaxX) oMaxX = maxX;
      if (minY < oMinY) oMinY = minY;
      if (maxY > oMaxY) oMaxY = maxY;

      componentFeatures.push({
        type: 'Feature',
        properties: {
          bbox: [minX, minY, maxX, maxY],
          minX,
          minY,
          geo_ids: component,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minX, minY],
              [maxX, minY],
              [maxX, maxY],
              [minX, maxY],
              [minX, minY],
            ],
          ],
        },
      });
    }

    if (!componentFeatures.length) return empty;

    componentFeatures.sort((a, b) => {
      if (a.properties!.minY > b.properties!.minY) return -1;
      if (a.properties!.minX < b.properties!.minX) return 1;
      return 0;
    });

    return {
      dissolved: {
        type: 'FeatureCollection' as const,
        features: componentFeatures,
      },
      overall: [oMinX, oMinY, oMaxX, oMaxY] as LngLatBoundsLike,
    };
  },
};

expose(GeometryWorker);
