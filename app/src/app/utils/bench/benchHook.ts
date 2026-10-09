'use client';
/**
 * Benchmark hook for the map-load benchmark (app/e2e/bench/). Off unless
 * localStorage.districtr_bench === '1' (read once at module load), so it can
 * ship in production builds without exposing anything by default.
 *
 * Exposes `window.__districtrBench` with the zustand stores, the map ref, the
 * MapLibre `idle`/`load` timestamps (performance.now()), and two helpers that
 * drive the same code paths as the UI: `paintAt` (the active brush's
 * selection query) and `shatter` (the shatter tool's handler).
 */
import type {Map as MaplibreMap, MapGeoJSONFeature, MapLayerMouseEvent} from 'maplibre-gl';
import {useMapStore} from '@store/mapStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useDemographyStore} from '@store/demography/demographyStore';
import {demographyService} from '@utils/demography/demographyService';
import {getTopology} from '@utils/topology/state';
import {lonOfMercX, latOfMercY} from '@utils/topology/decode';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_POINTS_LAYER_ID,
  BLOCK_POINTS_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
} from '@constants/map/layerIds';

const enabled = (() => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('districtr_bench') === '1';
  } catch {
    return false;
  }
})();

const getMap = (): MaplibreMap | undefined => useMapStore.getState().getMapRef();

/** Same layer list the brush/eraser use in handleMapMouseMove (getLayerIdsToPaint). */
const brushLayers = () =>
  useMapStore.getState().mapDocument?.child_layer
    ? [
        BLOCK_POINTS_LAYER_ID,
        BLOCK_POINTS_LAYER_ID_CHILD,
        BLOCK_HOVER_LAYER_ID,
        BLOCK_HOVER_LAYER_ID_CHILD,
      ]
    : [BLOCK_POINTS_LAYER_ID, BLOCK_HOVER_LAYER_ID];

const syntheticEvent = (map: MaplibreMap, x: number, y: number) =>
  ({
    point: {x, y},
    lngLat: map.unproject([x, y]),
    target: map,
    originalEvent: {},
  }) as unknown as MapLayerMouseEvent;

if (enabled) {
  const idle: number[] = [];
  const load: number[] = [];
  // When the bench first saw each map instance (MapLibre `load` may fire before that).
  const attachedAt: number[] = [];
  let attached: MaplibreMap | undefined;
  // getMapRef reads a React ref that fills in after mount; poll until it does
  // (and re-attach if the map is remounted).
  setInterval(() => {
    const map = getMap();
    if (!map || map === attached) return;
    attached = map;
    attachedAt.push(performance.now());
    map.on('idle', () => idle.push(performance.now()));
    map.on('load', () => load.push(performance.now()));
  }, 25);

  const bench = {
    stores: {
      map: useMapStore,
      assignments: useAssignmentsStore,
      mapControls: useMapControlsStore,
      demography: useDemographyStore,
    },
    demographyService,
    getMapRef: getMap,
    /** Topology prototype: lon/lat label point of a loaded unit, or null. */
    labelOf(path: string): [number, number] | null {
      const topo = getTopology();
      const unit = topo?.unitByPath.get(path);
      if (!topo || unit === undefined) return null;
      const chunk =
        unit < topo.P
          ? topo.parents
          : [...topo.chunks.values()].find(c => c.children.paths[unit - c.children.firstUnit])
              ?.children;
      if (!chunk) return null;
      const k = unit - chunk.firstUnit;
      return [lonOfMercX(chunk.label[2 * k]), latOfMercY(chunk.label[2 * k + 1])];
    },
    ids: {
      source: BLOCK_SOURCE_ID,
      parentHover: BLOCK_HOVER_LAYER_ID,
      childHover: BLOCK_HOVER_LAYER_ID_CHILD,
    },
    idle,
    load,
    attachedAt,
    /** Run the active paint function at a canvas point; returns the feature count. */
    paintAt(x: number, y: number, brushSize?: number): number {
      const map = getMap();
      if (!map) return -1;
      const controls = useMapControlsStore.getState();
      const features = controls.paintFunction(
        map,
        syntheticEvent(map, x, y),
        brushSize ?? controls.brushSize,
        brushLayers(),
        true
      );
      return features?.length ?? 0;
    },
    /** Shatter one parent the way the shatter tool does (mapStore.handleShatter). */
    async shatter(path: string): Promise<{hadGeometry: boolean}> {
      const map = getMap();
      const sourceLayer = useMapStore.getState().mapDocument?.parent_layer;
      const found = map?.querySourceFeatures(BLOCK_SOURCE_ID, {
        sourceLayer,
        filter: ['==', ['get', 'path'], path],
      })?.[0];
      const feature: Partial<MapGeoJSONFeature> = {
        id: path,
        source: BLOCK_SOURCE_ID,
        sourceLayer,
        properties: found?.properties ?? {path},
        geometry: found?.geometry,
      };
      await useMapStore.getState().handleShatter([feature]);
      return {hadGeometry: !!found};
    },
  };
  (window as unknown as {__districtrBench: typeof bench}).__districtrBench = bench;
}

export {};
