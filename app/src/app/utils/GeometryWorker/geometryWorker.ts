import {expose} from 'comlink';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import {LngLatBoundsLike} from 'maplibre-gl';
import bbox from '@turf/bbox';
import nearestPoint from '@turf/nearest-point';
import {EMPTY_FT_COLLECTION} from '../../constants/layers';

const POINT_LIMIT = 256;
const MIN_POPULATION = 300;

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
  async getMedianPoint(
    bounds: [number, number, number, number],
    activeZones: number[]
  ) {
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
    const coords: Record<number, {lng: number[], lat: number[]}> = {};
    
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
        features: points
      };
      const medianLat = coords[zone].lat.sort((a, b) => a - b)[Math.floor(coords[zone].lat.length / 2)];
      const medianLng = coords[zone].lng.sort((a, b) => a - b)[Math.floor(coords[zone].lng.length / 2)];
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
  async getCentroidsFromView({
    bounds,
    activeZones,
    strategy = 'median-point',
  }) {
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
