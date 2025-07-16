import {expose} from 'comlink';
import dissolve from '@turf/dissolve';
import centerOfMass from '@turf/center-of-mass';
import {GeometryWorkerClass, MinGeoJSONFeature, SendDataToMainThread} from './geometryWorker.types';
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
import {
  quantizeGeoJSON,
  recursiveFindNotArray,
  explodeMultiPolygonToPolygons,
  GEO_OPERATION_DEBOUNCE_SHORT,
  MAX_CENTROID_RETRIES,
  GEO_CLEANUP_BUFFER_IN_M,
  GEO_OPERATION_TIMEOUT,
} from './workerUtilts';

/**
 * This is a global function to send data back to the main thread state.
 *
 * This must be global because comlink, scope, and structured cloning
 * do not play nicely together with a callback from the main thread.
 */
let sendDataToMainThread: SendDataToMainThread = null;

const GeometryWorker: GeometryWorkerClass = {
  geometries: {},
  activeGeometries: {},

  shatterIds: {
    parents: [],
    children: [],
  },

  zoneAssignments: {},
  zonesChanged: new Set<number>(),
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
    this.debouncedRunGeoOperations(true);
  },
  busy: false,
  shouldGenerateOutlines: false,
  shouldGenerateCentroids: false,
  geoOperationsTimeout: null,
  setSendDataCallback(callback) {
    sendDataToMainThread = callback;
  },
  getGeos() {
    return {
      type: 'FeatureCollection',
      features: Object.values(this.activeGeometries),
    };
  },
  debouncedRunGeoOperations(
    runAll: boolean = false,
    debounce: number = GEO_OPERATION_DEBOUNCE_SHORT
  ) {
    this.geoOperationsTimeout && clearTimeout(this.geoOperationsTimeout);
    this.geoOperationsTimeout = setTimeout(() => {
      this.runGeoOperations(runAll);
    }, debounce);
  },
  runGeoOperations(runAll: boolean = false) {
    if (runAll) {
      this.shouldGenerateOutlines = true;
      this.shouldGenerateCentroids = true;
    }
    if (!this.shouldGenerateOutlines && !this.shouldGenerateCentroids) return;
    if (this.busy) {
      this.debouncedRunGeoOperations(runAll);
      return;
    }
    this.busy = true;
    if (this.shouldGenerateOutlines) {
      const response = this.updateMasses();
      if (response.ok) {
        sendDataToMainThread?.({outlines: response.data});
        this.shouldGenerateOutlines = false;
      } else {
        this.busy = false;
        return;
      }
    }
    if (this.shouldGenerateCentroids) {
      const response = this.updateCentroids();
      if (response.ok) {
        sendDataToMainThread?.({centroids: response.data});
        this.shouldGenerateCentroids = false;
      } else {
        this.busy = false;
        return;
      }
    }
    this.busy = false;
  },
  updateZones(entries) {
    entries.forEach(([id, zone]) => {
      if (this.zoneAssignments[id] !== zone) {
        if (this.zoneMasses?.features?.length) {
          this.zonesChanged.add(zone);
          if (this.zoneAssignments[id]) {
            this.zonesChanged.add(this.zoneAssignments[id]);
          }
        }
        this.zoneAssignments[id as string] = zone as number;
      }
    });
    if (this.zonesChanged.size || !this.zoneMasses) {
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
    this.geoOperationsTimeout && clearTimeout(this.geoOperationsTimeout);
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

        let geojsonFeature: any = quantizeGeoJSON(feature.toGeoJSON(tileID.x, tileID.y, tileID.z));

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
        }
      }
    }
    this.busy = false;
    this.loadedTiles.add(tileKey);
    this.zoneMasses = null;
    this.zonesChanged.clear();
    this.debouncedRunGeoOperations(true, GEO_OPERATION_TIMEOUT);
  },
  updateMasses() {
    if (!sendDataToMainThread) {
      return {
        ok: false,
        error: 'No send data callback set',
      };
    }
    let features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [
      ...(this.zoneMasses?.features?.filter(f => !this.zonesChanged.has(f.properties?.zone)) ?? []),
    ];
    const currentZones = new Set(features.map(f => f.properties?.zone));
    const featuresToDissolve: Record<number, GeoJSON.Feature[]> = {};
    this.getGeos().features.forEach((f, i) => {
      const zone = this.zoneAssignments[f.properties?.path];
      if (zone === null || zone === undefined) return;
      if (this.zonesChanged.size && !this.zonesChanged.has(zone)) return;
      if (currentZones.has(zone)) return;
      if (!featuresToDissolve[zone]) {
        featuresToDissolve[zone] = [];
      }
      featuresToDissolve[zone].push(f);
    });
    const unionedFeatures = Object.entries(featuresToDissolve)
      .map(([zone, features]) => {
        const fc = featureCollection(features as GeoJSON.Feature<GeoJSON.Polygon>[]);
        const unioned = features.length === 1 ? features[0] : union(fc);
        if (!unioned?.geometry) {
          console.error('No geometry found for unioned features', fc);
          return null;
        }
        return {
          type: 'Feature',
          properties: {
            zone: +zone,
          },
          geometry: unioned.geometry,
        } as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      })
      .filter(f => f !== null);
    unionedFeatures.forEach(f => {
      const buffered = buffer(
        buffer(f, GEO_CLEANUP_BUFFER_IN_M, {units: 'meters'}),
        -GEO_CLEANUP_BUFFER_IN_M,
        {
          units: 'meters',
        }
      );
      if (buffered) {
        buffered.properties = f.properties;
        features.push(buffered);
      }
    });
    // buffer features to clean up
    if (features.length === 0) {
      return {
        ok: false,
        error: 'No features to update',
      };
    } else {
      this.zoneMasses = featureCollection(features);
      this.zonesChanged.clear();
      return {
        ok: true,
        data: this.zoneMasses,
      };
    }
  },
  updateCentroids() {
    if (!sendDataToMainThread || !this.zoneMasses) {
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
      const geometryIsValid = recursiveFindNotArray(geometry.geometry.coordinates);
      if (!geometryIsValid) {
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
