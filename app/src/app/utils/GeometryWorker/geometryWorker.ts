import {expose} from 'comlink';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import bbox from '@turf/bbox';
import booleanWithin from '@turf/boolean-within';
import distance from '@turf/distance';
import union from '@turf/union';
import nearestPoint from '@turf/nearest-point';
import {EMPTY_FT_COLLECTION} from '../../constants/layers';

const CENTROID_BUFFER_KM = 10;

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
  async getCentersOfMass(
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
    
    pointData.features.forEach(point => {
      const id = point.properties?.path;
      if (!id) return;
      const zone = this.zoneAssignments[id];
      if (zone === null || zone === undefined || !activeZones.includes(zone)) return;
      
      const [lng, lat] = point.geometry.coordinates;
      // Filter points within bounds
      if (lng < minLon || lng > maxLon || lat < minLat || lat > maxLat) return;
      
      if (!zonePoints[zone]) {
        zonePoints[zone] = [];
      }
      zonePoints[zone].push(point);
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
      
      // Calculate bbox around the points in this zone
      const zoneBbox = bbox(zonePointCollection);
      const [bboxMinLon, bboxMinLat, bboxMaxLon, bboxMaxLat] = zoneBbox;
      
      // Find the center of the bbox
      const bboxCenter: GeoJSON.Feature<GeoJSON.Point> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [(bboxMinLon + bboxMaxLon) / 2, (bboxMinLat + bboxMaxLat) / 2],
        },
      };
      
      // Find the nearest point to the bbox center
      const nearest = nearestPoint(bboxCenter, zonePointCollection);
      
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
  async getNonCollidingRandomCentroids(
    bounds: [number, number, number, number],
    activeZones: number[],
    minBuffer?: number
  ) {
    const pointData = this.pointData;
    const {centroids, dissolved, visitedZones, bboxGeom} = this.getCentroidBoilerplate(bounds);
    if (!activeZones.length || !pointData?.features?.length) {
      return {
        centroids,
        dissolved,
      };
    }
    const minimumDistance = minBuffer ?? CENTROID_BUFFER_KM;
    const [minLon, minLat, maxLon, maxLat] = bounds;

    // re-use previous centroids if possible
    Object.entries(this.previousCentroids).forEach(([zone, previousCentroid]) => {
      const previousCentroidId = previousCentroid.properties?.id;
      if (!previousCentroidId) return;
      const currentZone = this.zoneAssignments[previousCentroidId];
      const zoneChanged = currentZone !== +zone && activeZones.includes(currentZone);
      // if this geo was erased or change the zone, do not re-use it
      if (currentZone === null || zoneChanged) {
        return;
      }
      // check if within current view
      const geoIsWithinView = booleanWithin(previousCentroid, bboxGeom);
      if (!geoIsWithinView) {
        return;
      }
      try {
        // check if it intersects with any other centroid given the new view
        const intersectsAny = centroids.features.some(pointFeature => {
          const distanceBetween = distance(previousCentroid, pointFeature, {units: 'kilometers'});
          return distanceBetween < minimumDistance;
        });
        if (intersectsAny) {
          return;
        }
        centroids.features.push(previousCentroid);
        visitedZones.add(+zone);
      } catch (e) {}
    });
    
    // Filter points by bounds and zone assignments
    const validPoints = pointData.features
      .map(point => {
        const id = point.properties?.path;
        if (!id) return null;
        const zone = this.zoneAssignments[id];
        if (zone === null || zone === undefined || !activeZones.includes(zone)) return null;
        
        const [lng, lat] = point.geometry.coordinates;
        // Filter points within bounds
        if (lng < minLon || lng > maxLon || lat < minLat || lat > maxLat) return null;
        
        return {point, zone, id};
      })
      .filter((p): p is {point: GeoJSON.Feature<GeoJSON.Point>; zone: number; id: string} => p !== null);
    
    // Randomly sort points to avoid bias
    const shuffledPoints = validPoints.sort(() => Math.random() - 0.5);
    
    for (const {point, zone, id} of shuffledPoints) {
      // once every zone has a point, break the loop
      if (activeZones.every(z => visitedZones.has(z))) break;
      
      const zoneIsNeeded = !visitedZones.has(zone);
      if (!zoneIsNeeded) continue;
      
      // Check if point is within view bounds
      const pointFeature: GeoJSON.Feature<GeoJSON.Point> = {
        type: 'Feature',
        geometry: point.geometry,
        properties: {},
      };
      const geoIsWithinView = booleanWithin(pointFeature, bboxGeom);
      if (!geoIsWithinView) continue;
      
      try {
        // Check if it intersects with any other centroid
        const intersectsAny = Object.entries(this.previousCentroids).some(
          ([cZone, prevCentroid]) => {
            if (+zone === +cZone || !prevCentroid || !cZone) return false;
            const distanceBetween = distance(pointFeature, prevCentroid, {units: 'kilometers'});
            return distanceBetween < minimumDistance;
          }
        );
        // if it intersects with any other centroid of the current view, skip
        if (intersectsAny) continue;
        
        const centroid: GeoJSON.Feature<GeoJSON.Point> = {
          type: 'Feature',
          properties: {zone, id},
          geometry: point.geometry,
        };
        centroids.features.push(centroid);
        visitedZones.add(zone);
        this.previousCentroids[zone] = centroid;
      } catch (e) {
        console.error(e);
      }
    }
    return {
      centroids,
      dissolved,
    };
  },
  async getCentroidsFromView({
    bounds,
    activeZones,
    strategy = 'non-colliding-centroids',
    minBuffer,
  }) {
    switch (strategy) {
      case 'center-of-mass':
        return await this.getCentersOfMass(bounds, activeZones);
      case 'non-colliding-centroids':
        return await this.getNonCollidingRandomCentroids(bounds, activeZones, minBuffer);
      default:
        return await this.getNonCollidingRandomCentroids(bounds, activeZones);
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
