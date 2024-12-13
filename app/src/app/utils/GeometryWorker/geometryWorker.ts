import {expose} from 'comlink';
import {area} from '@turf/area';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import pointOnFeature from '@turf/point-on-feature';
import pointsWithinPolygon from '@turf/points-within-polygon';
import {MapGeoJSONFeature} from 'maplibre-gl';
import bbox from '@turf/bbox';

const GeometryWorker: GeometryWorkerClass = {
  geometries: {},
  getGeos() {
    return {
      type: 'FeatureCollection',
      features: Object.values(this.geometries),
    };
  },
  updateProps(entries) {
    entries.forEach(([id, zone]) => {
      if (this.geometries[id]?.properties) {
        this.geometries[id].properties['zone'] = zone;
      }
    });
  },
  loadGeometry(featuresOrStringified, idProp) {
    const features: MapGeoJSONFeature[] =
      typeof featuresOrStringified === 'string'
        ? JSON.parse(featuresOrStringified)
        : featuresOrStringified;
    const firstEntry = Object.values(this.geometries)[0];
    if (features.length && firstEntry) {
      if (features[0].sourceLayer !== firstEntry.sourceLayer) {
        this.geometries = {};
      }
    }
    features.forEach(f => {
      const id = f.properties?.[idProp];
      if (id && !this.geometries[id]) {
        this.geometries[id] = structuredClone(f);
      }
    });
  },
  dissolveGeometry(features) {
    let dissolved: GeoJSON.FeatureCollection = dissolve(
      {
        type: 'FeatureCollection',
        features: features.filter(
          f => f.geometry.type === 'Polygon'
        ) as GeoJSON.Feature<GeoJSON.Polygon>[],
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
    const cleanDissolvedFeatures = Object.values(largestDissolvedFeatures).map(f => f.feature);
    const centroids: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cleanDissolvedFeatures.map(f => {
        const center = centerOfMass(f);
        const geometry =
          pointsWithinPolygon(center, f as any).features.length === 1
            ? center.geometry
            : pointOnFeature(f).geometry;

        return {
          type: 'Feature',
          properties: {
            zone: Number(f.properties?.zone),
          },
          geometry,
        };
      }),
    };
    return {
      centroids,
      dissolved,
    };
  },
  getCentroidsFromView(minLon, minLat, maxLon, maxLat) {
    const clippedFeatures: GeoJSON.Feature[] = [];
    this.getGeos().features.forEach(f => {
      if (f.properties?.zone == null) return;
      const clipped = bboxClip(f.geometry as GeoJSON.Polygon, [minLon, minLat, maxLon, maxLat]);
      if (clipped.geometry?.coordinates.length) {
        clippedFeatures.push({
          ...f,
          geometry: clipped.geometry,
        });
      }
    });
    const {dissolved, centroids} = this.dissolveGeometry(clippedFeatures as MapGeoJSONFeature[]);
    return {dissolved, centroids};
  },
  getUnassignedGeometries() {
    const geomsToDissolve = []
    const unassignedOtherGeoms = []
    for (const id in this.geometries) {
      const geom = this.geometries[id]
      if (geom.properties?.zone == null) {
        if (geom.geometry.type === 'Polygon') {
          geomsToDissolve.push(geom)
        } else {
          this.geometries[id].properties.bbox = bbox(geom.geometry)
          unassignedOtherGeoms.push(geom)
        }
      }
    }
    const dissolved = dissolve({
      type: 'FeatureCollection',
      features: geomsToDissolve as GeoJSON.Feature<GeoJSON.Polygon>[],
    }).features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        bbox: bbox(f.geometry),
      },
    } as MinGeoJSONFeature))
    return [
      ...dissolved,
      ...unassignedOtherGeoms,
    ]
  }
};

expose(GeometryWorker);
