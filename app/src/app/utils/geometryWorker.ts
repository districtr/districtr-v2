import {expose} from 'comlink';
import {area} from '@turf/area';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import { GeometryWorkerClass } from './geometryWorker.types';


const GeometryWorker: GeometryWorkerClass = {
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
    // dissolved.features = dissolved.features.map(f => ({
    //   ...f,
    //   properties: {
    //     zone: parseInt(f.properties?.zone)
    //   }
    // }))

    const centroids: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cleanDissolvedFeautres.map(f => ({
        type: 'Feature',
        properties: {
          zone: +f.properties?.zone,
        },
        geometry: centerOfMass(f).geometry,
      })),
    };
    return {
      centroids,
      dissolved,
    };
  },
};

expose(GeometryWorker);

// const addZoneMetaLayersWorker = async ({
//   centroids,
//   dissolved,
// }: {
//   centroids?: GeoJSON.FeatureCollection;
//   dissolved?: GeoJSON.FeatureCollection;
// }) => {
//   const { getMapRef } = useMapStore.getState();
//   const mapRef = getMapRef();
//   if (!mapRef) return;

//   // Remove existing layers
//   ZONE_LABEL_LAYERS.forEach(id => {
//     mapRef.getLayer(id) && mapRef.removeLayer(id);
//     mapRef.getSource(id) && mapRef.removeSource(id);
//   });

//   // Add map source of centroids
//   mapRef.addSource('ZONE_LABEL', {
//     type: 'geojson',
//     data: centroids,
//   });

//   mapRef.addLayer({
//     id: 'ZONE_LABEL_BG',
//     type: 'circle',
//     source: 'ZONE_LABEL',
//     paint: {
//       'circle-color': '#fff',
//       'circle-radius': 15,
//       'circle-opacity': 0.8,
//       'circle-stroke-color': '#000',
//       'circle-stroke-width': 2,
//     },
//     filter: ['==', ['get', 'zone'], ['get', 'zone']],
//   });

//   mapRef.addLayer({
//     id: 'ZONE_LABEL',
//     type: 'symbol',
//     source: 'ZONE_LABEL',
//     layout: {
//       'text-field': ['get', 'zone'],
//       'text-font': ['Barlow Bold'],
//       'text-size': 18,
//       'text-anchor': 'center',
//       'text-offset': [0, 0],
//     },
//     paint: {
//       'text-color': '#000',
//     },
//   });
// };

// expose({ addZoneMetaLayersWorker });
