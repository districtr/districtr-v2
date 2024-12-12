import {expose} from 'comlink';
import {area} from '@turf/area';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import pointOnFeature from '@turf/point-on-feature';
import pointsWithinPolygon from '@turf/points-within-polygon';
import { MapGeoJSONFeature } from 'maplibre-gl';

const GeometryWorker: GeometryWorkerClass = {
  geometries: {},
  loaded: false,
  getGeos() {
    return {
      type: 'FeatureCollection',
      features: Object.values(this.geometries),
    }
  },
  updateProps(entries) {
    entries.forEach(([id, zone]) => {
      if (this.geometries[id]?.properties) {
        this.geometries[id].properties['zone'] = zone;
      }
    });
  },
  loadGeometry(_features, idProp) {
    const features = (typeof _features === 'string' ? JSON.parse(_features) : _features) as MapGeoJSONFeature[];
    const firstEntry = Object.values(this.geometries)[0];
    if (features.length && firstEntry) {
      if (features[0].sourceLayer !== firstEntry.sourceLayer) {
        this.geometries = {};
      }
    }
    features.forEach(f => {
      const id = f.properties?.[idProp];
      if (id && !this.geometries[id]) {
        this.geometries[id] = JSON.parse(JSON.stringify(f));
      }
    });
  },
  parseGeometry(features: GeoJSON.Feature[]) {
    let dissolved: GeoJSON.FeatureCollection = dissolve(
      {
        type: 'FeatureCollection',
        features: features as any,
      },
      {
        propertyName: 'zone',
      }
    );
    let largestDissolvedFeatures: Record<number, {feature: GeoJSON.Feature; area: number}> = {};

    dissolved.features.forEach(feature => {
      const zone = feature.properties?.zone;
      if (!zone) return;
      const featureArea = area(feature);
      if (!largestDissolvedFeatures[zone] || featureArea > largestDissolvedFeatures[zone].area) {
        largestDissolvedFeatures[zone] = {
          area: featureArea,
          feature,
        };
      }
    });
    const cleanDissolvedFeautres = Object.values(largestDissolvedFeatures).map(f => f.feature);
    const centroids: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cleanDissolvedFeautres.map(f => {
        const center = centerOfMass(f);
        const geometry = pointsWithinPolygon(center, f as any).features.length === 1
          ? center.geometry
          : pointOnFeature(f).geometry;

        return {
          type: 'Feature',
          properties: {
            zone: +f.properties?.zone,
          },
          geometry
        }
      }),
    };
    return {
      centroids,
      dissolved,
    };
  },
  parseFromView(minLon: number, minLat: number, maxLon: number, maxLat: number) {
    const clippedFeatures: GeoJSON.Feature[] = []
    this.getGeos().features.forEach(f => {
      if (f.properties?.zone === null || f.properties?.zone === undefined) return
      const clipped = bboxClip(f.geometry as GeoJSON.Polygon, [minLon, minLat, maxLon, maxLat]);
      if (clipped.geometry?.coordinates.length) {
        clippedFeatures.push({
          ...f,
          geometry: clipped.geometry,
        });
      }
    })
    const {dissolved, centroids} = this.parseGeometry(clippedFeatures as MapGeoJSONFeature[]);
    return {dissolved, centroids};
  },
};

expose(GeometryWorker);
