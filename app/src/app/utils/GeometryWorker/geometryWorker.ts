import {expose} from 'comlink';
import {area} from '@turf/area';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import pointOnFeature from '@turf/point-on-feature';
import pointsWithinPolygon from '@turf/points-within-polygon';
import {LngLatBoundsLike, MapGeoJSONFeature} from 'maplibre-gl';
import bbox from '@turf/bbox';
import {VectorTile} from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import booleanWithin from '@turf/boolean-within';
import distance from '@turf/distance';

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
  shatterIds: {
    parents: [],
    children: [],
  },
  previousCentroids: {},
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
  updateProps(entries, iters = 0) {
    let ok = 0;
    let missing = 0;
    if (iters > 5) {
      return;
    }
    entries.forEach(([id, zone]) => {
      if (this.geometries[id]?.properties) {
        ok++;
        this.geometries[id].properties['zone'] = zone;
      } else {
        missing++;
      }
    });
    const total = ok + missing;
    if (missing / total > 0.5) {
      setTimeout(() => {
        this.updateProps(entries, iters + 1);
      }, 50);
    }
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
    this.shatterIds = {
      parents: [],
      children: [],
    };
  },
  resetZones() {
    for (const id in this.geometries) {
      this.geometries[id].properties.zone = null;
    }
  },
  loadTileData({tileData, tileID, mapDocument, idProp}) {
    const returnData = [];
    const tile = new VectorTile(new Protobuf(tileData));
    // Iterate through each layer in the tile
    const parentLayer = mapDocument.parent_layer;
    const childLayer = mapDocument.child_layer;
    for (const layerName in tile.layers) {
      const isParent = layerName === parentLayer;
      const layer = tile.layers[layerName];

      // Extract features from the layer
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const id = feature?.properties?.[idProp] as string;
        const prevZoom = this.geometries?.[id]?.zoom;

        if (!id || (prevZoom && prevZoom > tileID.z)) continue;
        let geojsonFeature: any = feature.toGeoJSON(tileID.x, tileID.y, tileID.z);
        geojsonFeature.zoom = tileID.z;
        geojsonFeature.id = id;
        geojsonFeature.sourceLayer = layerName;
        geojsonFeature.properties = feature.properties;
        this.geometries[id as string] = geojsonFeature;
        if (
          (isParent && !this.shatterIds.parents.includes(id)) ||
          (!isParent && this.shatterIds.children.includes(id))
        ) {
          this.activeGeometries[id] = geojsonFeature;
          returnData.push({
            id,
            properties: feature.properties,
            sourceLayer: layerName,
          } as unknown as MinGeoJSONFeature);
        }
      }
    }
    return returnData;
  },
  loadGeometry(featuresOrStringified, idProp) {
    const features: MapGeoJSONFeature[] =
      typeof featuresOrStringified === 'string'
        ? JSON.parse(featuresOrStringified)
        : featuresOrStringified;
    const firstEntry = Object.values(this.geometries)[0];
    features.forEach(f => {
      const id = f.properties?.[idProp];
      // TODO: Sometimes, geometries are split across tiles or reloaded at more detailed zoom levels
      // disambiguating and combining them could be very cool, but is tricky with lots of edge cases
      // and computationally expensive. For now, we just take the first geometry of a given ID
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
    const centroids: GeoJSON.FeatureCollection<GeoJSON.Point> = {
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
        } as GeoJSON.Feature<GeoJSON.Point>;
      }),
    };
    return {
      centroids,
      dissolved,
    };
  },
  getCentroidsFromView({bounds: [minLon, minLat, maxLon, maxLat], activeZones, fast, minBuffer}) {
    const visitedZones = new Set();
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
    if (!activeZones.length) {
      return {
        centroids,
        dissolved,
      };
    }

    if (fast) {
      const minimumDistance = minBuffer ?? CENTROID_BUFFER_KM
      // convert 30pixels
      Object.entries(this.previousCentroids).forEach(([zone, centroid]) => {
        if (!centroid.properties?.id || !centroid.properties.zone) return;
        const props = centroid.properties;
        const currZone = this.activeGeometries[props.id]?.properties?.zone;
        if (!currZone || currZone !== props.zone && activeZones.includes(currZone)) return;
        const within = booleanWithin(centroid, bboxGeom);
        if (!within) return;
        try {

          const intersectsAny = centroids.features.some(pointFeature => {
            const distanceBetween = distance(centroid, pointFeature, { units: 'kilometers' });
            return distanceBetween < minimumDistance;
          })
          if (intersectsAny) return;
          centroids.features.push(centroid);
          visitedZones.add(+zone);
        } catch (e) {}
      });
      const keys = Object.keys(this.activeGeometries).sort(() => Math.random() - 0.5);
      for (let i = 0; i < keys.length; i++) {
        if (activeZones.every(zone => visitedZones.has(zone))) break;
        const key = keys[i];
        const f = this.activeGeometries[key];
        if (f.properties?.zone == null) continue;
        const zone = f.properties.zone;
        if (visitedZones.has(zone) || !activeZones.includes(zone) || f.geometry.type !== 'Polygon') continue;
        const within = booleanWithin(f, bboxGeom);
        if (!within) continue;
        try {
          let centroid = centerOfMass(f);
          const intersectsAny = Object.entries(this.previousCentroids).some(([cZone, prevCentroid]) => {
            if (zone === cZone || !prevCentroid || !cZone) return false;
            const distanceBetween = distance(centroid, prevCentroid, { units: 'kilometers' });
            return distanceBetween < minimumDistance;
          })
          if (intersectsAny) continue;
          centroid.properties = {zone, id: key};
          // @ts-ignore
          centroids.features.push(centroid);
          visitedZones.add(zone);
          this.previousCentroids[zone] = centroid;
        } catch (e) {
          console.log(e);
        }
      }
    } else {
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
      const results = this.dissolveGeometry(clippedFeatures as MapGeoJSONFeature[]);
      centroids.features = results.centroids.features as GeoJSON.Feature<GeoJSON.Point>[];
      dissolved.features = results.dissolved.features;
    }
    return {
      centroids,
      dissolved,
    };
  },
  getPropertiesCentroids(ids) {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

    ids.forEach(id => {
      const f = this.geometries[id];
      if (f) {
        let center = centerOfMass(f);
        center.properties = f.properties;
        features.push(center);
      } else {
        console.log('Could not find geography', id);
      }
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  },
  async getUnassignedGeometries(useBackend = false, documentId?: string, exclude_ids?: string[]) {
    const geomsToDissolve: GeoJSON.Feature[] = [];
    if (useBackend) {
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
