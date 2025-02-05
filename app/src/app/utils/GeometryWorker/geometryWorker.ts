import {expose} from 'comlink';
import {area} from '@turf/area';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import pointOnFeature from '@turf/point-on-feature';
import pointsWithinPolygon from '@turf/points-within-polygon';
import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import bbox from '@turf/bbox';

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
  removeGeometries(ids) {
    ids.forEach(id => {
      delete this.geometries[id];
    });
  },
  clearGeometries() {
    this.geometries = {};
  },
  loadGeometry(featuresOrStringified, idProp) {
    // const features: MapGeoJSONFeature[] =
    //   typeof featuresOrStringified === 'string'
    //     ? JSON.parse(featuresOrStringified)
    //     : featuresOrStringified;
    // const firstEntry = Object.values(this.geometries)[0];
    // features.forEach(f => {
    //   const id = f.properties?.[idProp];
    //   // TODO: Sometimes, geometries are split across tiles or reloaded at more detailed zoom levels
    //   // disambiguating and combining them could be very cool, but is tricky with lots of edge cases
    //   // and computationally expensive. For now, we just take the first geometry of a given ID
    //   if (id && !this.geometries[id]) {
    //     this.geometries[id] = structuredClone(f);
    //   }
    // });
  },
  loadRectFeatures(featureDict) {
    Object.entries(featureDict).forEach(([id, feature]) => {
      const {properties, bboxes} = feature;
      const geoms: GeoJSON.Feature<GeoJSON.Polygon>[] = bboxes.map(bbox => {
        const {minX, minY, maxX, maxY} = bbox;
        return {
          type: 'Feature',
          properties: {
            ...properties,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [minX, minY],
                [minX, maxY],
                [maxX, maxY],
                [maxX, minY],
                [minX, minY],
              ],
            ],
          },
        };
      });

      const dissolved =
        geoms.length === 1
          ? geoms[0]
          : dissolve({type: 'FeatureCollection', features: geoms}).features[0];
      this.geometries[id] = {
        ...dissolved,
        properties: {
          ...properties,
        },
      };
    });
  },
  dissolveGeometry(features) {
    let dissolved: GeoJSON.FeatureCollection = dissolve(
      {
        type: 'FeatureCollection',
        features: features.filter(
          // TODO: Turf dissolve is limted to only polygons. This is fine enough for label placement
          // but in the future we may want to do something better (eg. multipart to singlepart)
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
      // TODO: This makes sense for now given that we are not enforcing contiguity on zones,
      // but could likely be refactored later when that rule is enforced.
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
  async getUnassignedGeometries(useBackend = false, documentId?: string, exclude_ids?: string[]) {
    const geomsToDissolve: GeoJSON.Feature[] = [];
    if (useBackend) {
      console.log('Fetching unassigned geometries from backend');
      const url = new URL(
        `${process.env.NEXT_PUBLIC_API_URL}/api/document/${documentId}/unassigned`
      );
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
    } else {
      for (const id in this.geometries) {
        const geom = this.geometries[id];
        if (!geom.properties?.zone && !exclude_ids?.includes(id)) {
          const featureBbox = bbox(geom);
          geomsToDissolve.push({
            type: 'Feature',
            geometry: {
              coordinates: [
                [
                  [featureBbox[0], featureBbox[1]],
                  [featureBbox[0], featureBbox[3]],
                  [featureBbox[2], featureBbox[3]],
                  [featureBbox[2], featureBbox[1]],
                  [featureBbox[0], featureBbox[1]],
                ],
              ],
              type: 'Polygon',
            },
          } as GeoJSON.Feature);
        }
      }
    }
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
