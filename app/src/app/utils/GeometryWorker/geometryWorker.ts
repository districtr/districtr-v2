import {expose} from 'comlink';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import {LngLatBoundsLike} from 'maplibre-gl';
import bbox from '@turf/bbox';
import nearestPoint from '@turf/nearest-point';
import {EMPTY_FT_COLLECTION} from '../../constants/map/layerStyle';

const POINT_LIMIT = 256;
const MIN_POPULATION = 300;

// -- Polylabel: pole of inaccessibility (visual center of polygon) --
// Adapted from @mapbox/polylabel (ISC license)

function pointToPolygonDistance(x: number, y: number, rings: number[][][]): number {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[i][0],
        ay = ring[i][1];
      const bx = ring[j][0],
        by = ring[j][1];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
        inside = !inside;
      }
      // Squared distance from point to segment
      let dx = bx - ax,
        dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      dx = ax + t * dx - x;
      dy = ay + t * dy - y;
      minDistSq = Math.min(minDistSq, dx * dx + dy * dy);
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

function makeCell(x: number, y: number, h: number, rings: number[][][]): Cell {
  const d = pointToPolygonDistance(x, y, rings);
  return {x, y, h, d, max: d + h * Math.SQRT2};
}

function polylabel(rings: number[][][], precision = 0.5): [number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const outer = rings[0];
  for (const p of outer) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const w = maxX - minX,
    h = maxY - minY;
  const cellSize = Math.max(w, h);
  if (cellSize === 0) return [minX, minY];

  let best = makeCell(minX + w / 2, minY + h / 2, 0, rings);

  // Seed queue with initial grid
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      const cell = makeCell(x + cellSize / 2, y + cellSize / 2, cellSize / 2, rings);
      queue.push(cell);
      if (cell.d > best.d) best = cell;
    }
  }

  // Check centroid
  let area = 0,
    cx = 0,
    cy = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const a = outer[i],
      b = outer[j];
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cy += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area !== 0) {
    const centroid = makeCell(cx / area, cy / area, 0, rings);
    if (centroid.d > best.d) best = centroid;
  }

  // Sort descending by max potential so we process most promising first
  queue.sort((a, b) => b.max - a.max);

  while (queue.length) {
    const cell = queue.pop()!;
    if (cell.max - best.d <= precision) continue;
    const h2 = cell.h / 2;
    const children = [
      makeCell(cell.x - h2, cell.y - h2, h2, rings),
      makeCell(cell.x + h2, cell.y - h2, h2, rings),
      makeCell(cell.x - h2, cell.y + h2, h2, rings),
      makeCell(cell.x + h2, cell.y + h2, h2, rings),
    ];
    for (const c of children) {
      if (c.d > best.d) best = c;
      if (c.max > best.d + precision) {
        // Insert sorted (binary insert)
        let lo = 0,
          hi = queue.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (queue[mid].max < c.max) hi = mid;
          else lo = mid + 1;
        }
        queue.splice(lo, 0, c);
      }
    }
  }

  return [best.x, best.y];
}

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

  const [x, y] = polylabel(rings, 0.001);
  return {
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [x, y]},
    properties: {},
  };
};

const explodeMultiPolygonToPolygons = (
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
    const geomsToDissolve: GeoJSON.Feature[] = [];
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${documentId}/unassigned`);
    if (exclude_ids?.length) {
      exclude_ids.forEach(id => url.searchParams.append('exclude_ids', id));
    }
    const remoteUnassignedFeatures = await fetch(url).then(r => r.json());
    remoteUnassignedFeatures.features.forEach((geo: GeoJSON.MultiPolygon | GeoJSON.Polygon) => {
      if (geo.type === 'Polygon') {
        geomsToDissolve.push({
          type: 'Feature',
          properties: {},
          geometry: geo,
        });
      } else if (geo.type === 'MultiPolygon') {
        const polygons = explodeMultiPolygonToPolygons(geo);
        polygons.forEach(p => geomsToDissolve.push(p));
      }
    });

    if (!geomsToDissolve.length) {
      return {dissolved: {type: 'FeatureCollection', features: []}, overall: null};
    }
    let dissolved = dissolve({
      type: 'FeatureCollection',
      features: geomsToDissolve as GeoJSON.Feature<GeoJSON.Polygon>[],
    });

    const overall = bbox(dissolved) as LngLatBoundsLike;

    for (let i = 0; i < dissolved.features.length; i++) {
      const geom = dissolved.features[i].geometry;
      dissolved.features[i].properties = {
        ...(dissolved.features[i].properties || {}),
        bbox: bbox(geom),
        minX: geom.coordinates[0][0][0],
        minY: geom.coordinates[0][0][1],
      };
    }
    // sort by minX and minY
    dissolved.features = dissolved.features.sort((a, b) => {
      if (a.properties!.minY > b.properties!.minY) return -1;
      if (a.properties!.minX < b.properties!.minX) return 1;
      return 0;
    });

    return {
      dissolved,
      overall,
    };
  },
};

expose(GeometryWorker);
