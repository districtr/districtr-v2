import {expose} from 'comlink';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature} from './geometryWorker.types';
import bboxClip from '@turf/bbox-clip';
import {LngLatBoundsLike} from 'maplibre-gl';
import bbox from '@turf/bbox';
import {VectorTile} from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import booleanWithin from '@turf/boolean-within';
import union from '@turf/union';
import buffer from '@turf/buffer';
import {featureCollection, feature as featureHelper} from '@turf/helpers';
import {randomPoint} from '@turf/random';
import difference from '@turf/difference';

const GEO_OPERATION_TIMEOUT = 1000;
const GEO_OPERATION_DEBOUNCE_SHORT = 100;
const MAX_CENTROID_RETRIES = 1000;
/**
 * Round a single number to the nearest multiple of 1/factor.
 */
const qValue = (v: number, factor: number) => Math.round(v * factor) / factor;

/**
 * Recursively quantise any GeoJSON coordinate array.
 * Handles Point, LineString, Polygon, Multi* the same way.
 */
const qCoords = (coords: any, factor: number): any =>
  typeof coords[0] === 'number'
    ? coords.map((d: number) => qValue(d, factor))
    : coords.map((c: any) => qCoords(c, factor));

/**
 * Quantise a GeoJSON geometry object (in-place copy).
 */
const qGeometry = (geom: GeoJSON.Geometry, factor: number): GeoJSON.Geometry => ({
  ...geom,
  // @ts-expect-error
  coordinates: qCoords(geom.coordinates, factor),
});

/**
 * Quantise a single Feature or an entire FeatureCollection.
 * Anything else is returned unchanged.
 */
export const quantizeGeoJSON = <T extends GeoJSON.GeoJsonObject>(
  input: T,
  factor: number = 1e5 // default ≈ 1-m grid
): T => {
  if (input.type === 'Feature') {
    // @ts-expect-error
    const f = input as GeoJSON.Feature;
    // @ts-expect-error
    return {
      ...f,
      geometry: qGeometry(f.geometry, factor),
    } as T;
  }

  if (input.type === 'FeatureCollection') {
    // @ts-expect-error
    const fc = input as GeoJSON.FeatureCollection;
    // @ts-expect-error
    return {
      ...fc,
      features: fc.features.map(f => ({
        ...f,
        geometry: qGeometry(f.geometry, factor),
      })),
    } as T;
  }

  // Geometry object passed directly
  if ('coordinates' in input) {
    // @ts-expect-error
    return qGeometry(input as GeoJSON.Geometry, factor) as T;
  }

  return input; // Unsupported object (e.g. Topology) – leave unchanged
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

  shatterIds: {
    parents: [],
    children: [],
  },

  zoneAssignments: {},
  zoneUpdateLog: {},
  zoneMasses: null,

  loadedTiles: new Set<string>(),

  viewbox: null,

  updateViewbox(bounds) {
    // Defensive copy to avoid issues with structured cloning (DataCloneError)
    this.viewbox =
      Array.isArray(bounds) && bounds.length === 4
        ? ([...bounds] as [number, number, number, number])
        : null;
    this.shouldGenerateCentroids = true;
    // console.log("!!!Running geo operations from updateViewbox")
    this.debouncedRunGeoOperations(true);
  },
  busy: false,
  shouldGenerateOutlines: false,
  shouldGenerateCentroids: false,
  geoOperationsTimeout: null,
  sendDataToMainThread: null,
  setSendDataCallback(callback) {
    this.sendDataToMainThread = callback;
  },
  getGeos() {
    return {
      type: 'FeatureCollection',
      features: Object.values(this.activeGeometries),
    };
  },
  debouncedRunGeoOperations: (
    runAll: boolean = false,
    debounce: number = GEO_OPERATION_DEBOUNCE_SHORT,
    context: typeof GeometryWorker = GeometryWorker
  ) => {
    context.geoOperationsTimeout && clearTimeout(context.geoOperationsTimeout);
    context.geoOperationsTimeout = setTimeout(() => {
      context.runGeoOperations.apply(context, [runAll]);
    }, debounce);
  },
  runGeoOperations(runAll: boolean = false) {
    if (runAll) {
      this.shouldGenerateOutlines = true;
      this.shouldGenerateCentroids = true;
    }
    if (!this.shouldGenerateOutlines && !this.shouldGenerateCentroids) return;
    if (this.busy) {
      console.log('!!!Busy at runGeoOperations');
      this.debouncedRunGeoOperations(false, GEO_OPERATION_TIMEOUT);
      this.busy = false;
      return;
    }
    this.busy = true;
    if (this.shouldGenerateOutlines) {
      const response = this.updateMasses();
      if (response.ok) {
        console.log('!!!Sending outlines to main thread', response.data);
        this.sendDataToMainThread?.({outlines: response.data});
        this.shouldGenerateOutlines = false;
      } else {
        this.debouncedRunGeoOperations(false, GEO_OPERATION_TIMEOUT);
        this.busy = false;
        return;
      }
    }
    if (this.shouldGenerateCentroids) {
      const response = this.updateCentroids();
      if (response.ok) {
        console.log('!!!Sending centroids to main thread', response.data);
        this.sendDataToMainThread?.({centroids: response.data});
        this.shouldGenerateCentroids = false;
      } else {
        this.debouncedRunGeoOperations(false, GEO_OPERATION_TIMEOUT);
        this.busy = false;
        return;
      }
    }
    this.busy = false;
  },
  updateZones(entries) {
    this.busy = true;
    entries.forEach(([id, zone]) => {
      if (this.zoneAssignments[id] !== zone) {
        const shouldUpdatePrevious =
          this.zoneMasses && typeof this.zoneAssignments[id] === 'number';
        shouldUpdatePrevious &&
          (this.zoneUpdateLog[id] = {
            from: this.zoneAssignments[id],
            to: zone,
          });
        this.zoneAssignments[id as string] = zone as number;
      }
    });
    this.busy = false;
    if (Object.keys(this.zoneUpdateLog).length || !this.zoneMasses) {
      // console.log("!!!Running geo operations from zone updates")
      this.debouncedRunGeoOperations(true);
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
    this.shatterIds = {
      parents: [],
      children: [],
    };
  },
  resetZones() {
    this.zoneAssignments = {};
  },
  loadTileData({tileData, tileID, mapDocument, idProp}) {
    const tileKey = `${tileID.x}-${tileID.y}-${tileID.z}`;
    if (this.loadedTiles.has(tileKey)) return;
    this.busy = true;
    if (this.geoOperationsTimeout) {
      clearTimeout(this.geoOperationsTimeout);
      console.log('!!!Cleared geo operations timeout');
    }
    const returnData = [];
    const tile = new VectorTile(new Protobuf(tileData));
    // Iterate through each layer in the tile
    const parentLayer = mapDocument.parent_layer;
    const childLayer = mapDocument.child_layer;
    for (const layerName in tile.layers) {
      if (layerName === childLayer) continue;
      const isParent = layerName === parentLayer;
      const layer = tile.layers[layerName];
      // Extract features from the layer
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const id = feature?.properties?.[idProp] as string;
        // const prevZoom = this.geometries?.[id]?.zoom;
        if (!id) continue;
        const previousFeature = this.geometries[id];

        const childNotBroken = !isParent && !this.shatterIds.children.includes(id);
        if (childNotBroken) continue;
        const zoomDiff = previousFeature?.zoom && tileID.z - previousFeature.zoom;
        if (zoomDiff && zoomDiff < 0) continue;

        let geojsonFeature: any = quantizeGeoJSON(
          feature.toGeoJSON(tileID.x, tileID.y, tileID.z),
          1e4
        );

        try {
          if (previousFeature?.geometry && geojsonFeature?.geometry) {
            const unioned = union(
              featureCollection([featureHelper(previousFeature.geometry), geojsonFeature])
            );
            if (unioned?.geometry) {
              geojsonFeature.geometry = unioned?.geometry;
            }
          } else if (!previousFeature?.geometry) {
          }
        } catch (e) {}
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
    this.busy = false;
    this.loadedTiles.add(tileKey);
    console.log('!!!Running geo operations from loadTileData');
    // In a worker thread, 'this' context can be tricky. Call the debounced function directly.

    this.debouncedRunGeoOperations(true, GEO_OPERATION_TIMEOUT, this);
  },
  updateMasses() {
    if (!this.sendDataToMainThread) {
      return {
        ok: false,
        error: 'No send data callback set',
      };
    }
    let features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];

    if (!this.zoneMasses) {
      const featuresToDissolve: Record<number, GeoJSON.Feature[]> = {};
      console.log('!!!Getting geos from getGeos', this.getGeos().features.length);
      this.getGeos().features.forEach((f, i) => {
        const zone = this.zoneAssignments[f.properties?.path];
        if (zone === null || zone === undefined) return;
        if (!featuresToDissolve[zone]) {
          featuresToDissolve[zone] = [];
        }
        featuresToDissolve[zone].push(f);
      });

      const unionedFeatures = Object.entries(featuresToDissolve).map(([zone, features]) => {
        let unioned = union({
          type: 'FeatureCollection',
          features: features as GeoJSON.Feature<GeoJSON.Polygon>[],
        });
        return {
          type: 'Feature',
          properties: {
            zone: +zone,
          },
          geometry: unioned?.geometry,
        } as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      });
      features = unionedFeatures;
    } else if (Object.keys(this.zoneUpdateLog).length) {
      const differenceCollections: Array<{
        from: number;
        to: number;
        features: Array<MinGeoJSONFeature>;
      }> = [];
      Object.entries(this.zoneUpdateLog).forEach(([id, {from, to}]) => {
        const geometry = this.geometries[id];
        if (!geometry) return;
        const differenceCollectionIdx = differenceCollections.findIndex(dc => dc.from === from);
        if (differenceCollectionIdx === -1) {
          differenceCollections.push({
            from,
            to,
            features: [geometry],
          });
        } else {
          differenceCollections[differenceCollectionIdx].features.push(geometry);
        }
      });

      this.zoneUpdateLog = {};
      const differenceUnioned = differenceCollections.map(dc => {
        // @ts-expect-error
        const unioned = union(featureCollection(dc.features));
        return {
          from: dc.from,
          to: dc.to,
          geometry: unioned,
        };
      });
      features = this.zoneMasses.features.map(_feature => {
        let feature = structuredClone(_feature);
        differenceUnioned
          .filter(dc => dc.to === feature.properties?.zone)
          .forEach(dc => {
            if (!dc.geometry) return;
            const newGeometry = difference(
              // @ts-expect-error
              featureCollection([feature, featureHelper(dc.geometry)])
            );
            // @ts-expect-error
            feature.geometry = newGeometry?.geometry;
          });
        differenceUnioned
          .filter(dc => dc.from === feature.properties?.zone)
          .forEach(dc => {
            if (!dc.geometry) return;
            // @ts-expect-error
            const newGeometry = union(featureCollection([feature, featureHelper(dc.geometry)]));
            // @ts-expect-error
            feature.geometry = newGeometry?.geometry;
          });
        return feature;
      });
    } else {
      features = this.zoneMasses.features;
    }
    // buffer features to clean up
    // @ts-expect-error
    features = features.map(f =>
      // @ts-expect-error
      buffer(buffer(f, 500, {units: 'meters'}), -500, {units: 'meters'})
    );
    this.zoneMasses = featureCollection(features);
    return {
      ok: true,
      data: this.zoneMasses,
    };
  },
  updateCentroids() {
    if (!this.sendDataToMainThread || !this.zoneMasses) {
      return {
        ok: false,
        error: 'No send data callback set or no zone masses',
      };
    }
    const centroids: GeoJSON.Feature<GeoJSON.Point>[] = [];
    this.zoneMasses.features.forEach(_geo => {
      const geometry = this.viewbox
        ? bboxClip(_geo, this.viewbox)
        : (_geo as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>);
      try {
        const centroid = centerOfMass(geometry);
      } catch (e) {
        console.error('Error calculating centroid', e);
        return;
      }
      const centroid = centerOfMass(geometry);
      if (!centroid) {
        console.error('No centroid found for geometry', _geo);
        return;
      }
      if (!booleanWithin(centroid, geometry)) {
        for (let i = 0; i < MAX_CENTROID_RETRIES; i++) {
          const geometryBounds = bbox(geometry);
          const centroid = randomPoint(1, {bbox: geometryBounds});
          const candidateCentroid = centroid.features[0];
          if (booleanWithin(candidateCentroid, geometry)) {
            candidateCentroid.properties = {
              zone: _geo.properties?.zone,
            };
            centroids.push(candidateCentroid);
            break;
          }
        }
      } else {
        centroid.properties = {
          zone: _geo.properties?.zone,
        };
        centroids.push(centroid);
      }
    });
    return {
      ok: true,
      data: {
        type: 'FeatureCollection',
        features: centroids,
      },
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
