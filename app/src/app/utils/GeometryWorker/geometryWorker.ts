import {expose} from 'comlink';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import {LngLatBoundsLike} from 'maplibre-gl';
import polylabel from 'polylabel';
import {EMPTY_FT_COLLECTION} from '../../constants/map/layerStyle';
import {getMsgpack} from '../api/msgpack';

const MAX_ZONE_SAMPLES = 512;
const MIN_POPULATION = 300;
// Fraction of the view, per side, a kept label may drift into before it is re-placed.
const STICKY_INSET = 0.1;

type PointIndex = NonNullable<GeometryWorkerClass['pointIndex']>;

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
    // Only zones that gained or lost a unit re-place their label; untouched
    // districts keep theirs (see the sticky rule in getMedianPoint).
    const previous = this.zoneAssignments;
    const next: Record<string, number> = {};
    const changed = new Set<number>();
    entries.forEach(([id, value]) => {
      const zone = value as number;
      next[id] = zone;
      if (previous[id] !== zone) {
        changed.add(zone);
        if (previous[id] !== undefined) changed.add(previous[id]);
      }
    });
    for (const id in previous) {
      if (!(id in next)) changed.add(previous[id]);
    }
    changed.forEach(zone => delete this.previousCentroids[zone]);
    this.zoneAssignments = next;
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
    this.previousCentroids = {};
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
  getPointIndex() {
    const {pointData, childPointData, zoneAssignments} = this;
    let index = this.pointIndex;
    if (!index || index.parent !== pointData || index.child !== childPointData) {
      // Shattered parents are never zoned; their blocks carry the zone, so index both.
      const features = [...pointData.features, ...childPointData.features];
      const n = features.length;
      const built: PointIndex = {
        parent: pointData,
        child: childPointData,
        ids: new Array(n),
        x: new Float64Array(n),
        y: new Float64Array(n),
        pop: new Float64Array(n),
        zones: new Int32Array(n),
      };
      features.forEach((f, i) => {
        built.ids[i] = f.properties?.path;
        built.x[i] = f.geometry.coordinates[0];
        built.y[i] = f.geometry.coordinates[1];
        built.pop[i] = f.properties?.total_pop_20 ?? 0;
      });
      index = this.pointIndex = built;
    }
    if (index.zoneSource !== zoneAssignments) {
      for (let i = 0; i < index.ids.length; i++) {
        index.zones[i] = zoneAssignments[index.ids[i]] ?? -1;
      }
      index.zoneSource = zoneAssignments;
    }
    return index;
  },
  async getMedianPoint(bounds: [number, number, number, number], activeZones: number[]) {
    const {centroids, dissolved} = this.getCentroidBoilerplate(bounds);
    const {x, y, pop, zones} = this.getPointIndex();
    const [minLon, minLat, maxLon, maxLat] = bounds;
    const active = new Set(activeZones);

    // In-view points per zone; low-population points only as a last resort.
    const populated = new Map<number, number[]>();
    const fallback = new Map<number, number>();
    for (let i = 0; i < x.length; i++) {
      if (x[i] < minLon || x[i] > maxLon || y[i] < minLat || y[i] > maxLat) continue;
      const zone = zones[i];
      if (!active.has(zone)) continue;
      if (pop[i] >= MIN_POPULATION) {
        const list = populated.get(zone);
        list ? list.push(i) : populated.set(zone, [i]);
      } else if (!fallback.has(zone)) {
        fallback.set(zone, i);
      }
    }

    // After a pan or zoom-in, a label still clear of the view edge stays put rather
    // than hopping to a new median; labels placed at a closer zoom re-center.
    const span = maxLon - minLon;
    const insetX = span * STICKY_INSET;
    const insetY = (maxLat - minLat) * STICKY_INSET;
    const median = (values: number[]) => Float64Array.from(values).sort()[values.length >> 1];

    new Set([...populated.keys(), ...fallback.keys()]).forEach(zone => {
      const previous = this.previousCentroids[zone];
      if (previous && span <= previous.properties!.span * 1.01) {
        const [px, py] = previous.geometry.coordinates;
        if (
          px > minLon + insetX &&
          px < maxLon - insetX &&
          py > minLat + insetY &&
          py < maxLat - insetY
        ) {
          centroids.features.push(previous);
          return;
        }
      }
      const candidates = populated.get(zone) ?? [fallback.get(zone)!];
      // Even stride, not first-N: data order is geoid order, which clusters by county.
      const step = Math.ceil(candidates.length / MAX_ZONE_SAMPLES);
      const sample = step > 1 ? candidates.filter((_, k) => k % step === 0) : candidates;
      const mx = median(sample.map(i => x[i]));
      const my = median(sample.map(i => y[i]));
      let best = sample[0];
      let bestDistance = Infinity;
      sample.forEach(i => {
        const d = (x[i] - mx) ** 2 + (y[i] - my) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      centroids.features.push({
        type: 'Feature',
        properties: {zone, span},
        geometry: {type: 'Point', coordinates: [x[best], y[best]]},
      });
    });

    this.previousCentroids = Object.fromEntries(
      centroids.features.map(f => [f.properties!.zone, f])
    );
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
export default GeometryWorker;
