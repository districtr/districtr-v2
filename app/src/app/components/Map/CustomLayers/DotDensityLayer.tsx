'use client';
import {useEffect, useMemo} from 'react';
import {useMap} from 'react-map-gl/maplibre';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import DotDensityWorker from '@/app/utils/DotDensityWorker';
import {TILESET_URL} from '@/app/utils/api/constants';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {
  DOT_DENSITY_CATEGORIES,
  type DotDensityUniverse,
} from '@constants/demography/dotDensity';
import {coverForBounds, dataZoomForMapZoom, tileKey} from '@/app/utils/dotDensity/tileMath';
import {DotDensityCustomLayer, DOT_DENSITY_LAYER_ID} from './dotDensityCustomLayer';

const universeForVariable = (variable: string): DotDensityUniverse =>
  variable.includes('vap') ? 'VAP' : 'TOTPOP';

/** path → per-category counts + total, from the client-side demography table. */
const buildRowIndex = (universe: DotDensityUniverse): Map<string, number[]> | null => {
  const table = demographyService.overlayTable ?? demographyService.table;
  if (!table) return null;
  const {columns, total} = DOT_DENSITY_CATEGORIES[universe];
  const available = new Set(table.columnNames());
  if (!available.has(total)) return null;
  const rows = table.objects() as Array<Record<string, unknown>>;
  const index = new Map<string, number[]>();
  for (const row of rows) {
    const path = row.path as string;
    if (!path) continue;
    const values = columns.map(c => (available.has(c) ? Number(row[c]) || 0 : 0));
    values.push(Number(row[total]) || 0);
    index.set(path, values);
  }
  return index;
};

/** RGBA32F texel data: 2 texels per feature (cats 0-3 | cat4, cat5, total, 0). */
const buildTexels = (
  paths: string[],
  areas: Float64Array,
  rowIndex: Map<string, number[]>
): Float32Array => {
  const texels = new Float32Array(paths.length * 8);
  for (let i = 0; i < paths.length; i++) {
    const counts = rowIndex.get(paths[i]);
    const area = areas[i];
    if (!counts || !(area > 0)) continue;
    const o = i * 8;
    texels[o] = counts[0] / area;
    texels[o + 1] = counts[1] / area;
    texels[o + 2] = counts[2] / area;
    texels[o + 3] = counts[3] / area;
    texels[o + 4] = counts[4] / area;
    texels[o + 5] = counts[5] / area;
    texels[o + 6] = counts[6] / area; // total-population density
  }
  return texels;
};

/**
 * Mounts the shader-stippled dot density custom layer and keeps its tile set
 * and density textures in sync with the viewport and demography state.
 * Active via the "Dot density" display mode, or ?dotdensity=1 for debugging.
 */
export const DotDensityLayer: React.FC = () => {
  const mapRef = useMap();
  const tilesPath = useMapStore(state => state.mapDocument?.tiles_s3_path);
  const parentLayer = useMapStore(state => state.mapDocument?.parent_layer);
  const isDotDensityMode = useMapControlsStore(
    state => state.mapOptions.demographicDisplayMode === DEMOGRAPHIC_MODES.DOT_DENSITY
  );
  const debugEnabled = useMemo(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('dotdensity'),
    []
  );
  const enabled = isDotDensityMode || debugEnabled;

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!enabled || !map || !tilesPath || !parentLayer || !DotDensityWorker) return;

    const layer = new DotDensityCustomLayer();
    const addLayer = () => {
      if (map.getLayer(DOT_DENSITY_LAYER_ID)) return;
      const beforeId = map.getLayer(MAP_LAYER_ANCHOR_IDS.demography)
        ? MAP_LAYER_ANCHOR_IDS.demography
        : undefined;
      map.addLayer(layer, beforeId);
    };
    addLayer();
    DotDensityWorker.init(`${TILESET_URL}/${tilesPath}`, parentLayer);

    let alive = true;
    let rowIndex: Map<string, number[]> | null = null;
    const inflight = new Set<string>();

    const refreshRowIndex = () => {
      const universe = universeForVariable(useDemographyStore.getState().variable);
      rowIndex = buildRowIndex(universe);
    };

    const applyDensities = (key: string, paths: string[], areas: Float64Array) => {
      if (!rowIndex) return;
      layer.setTileDensities(key, buildTexels(paths, areas, rowIndex));
    };

    const rebuildAllDensities = () => {
      if (!alive) return;
      refreshRowIndex();
      if (!rowIndex) return;
      layer.forEachTile(applyDensities);
      map.triggerRepaint();
    };

    const updateCover = () => {
      const z = dataZoomForMapZoom(map.getZoom());
      const bounds = map.getBounds();
      const cover = coverForBounds(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        z
      );
      const wanted = new Set(cover.map(tileKey));
      for (const key of layer.tileKeys()) {
        if (!wanted.has(key)) layer.removeTile(key);
      }
      for (const tile of cover) {
        const key = tileKey(tile);
        if (layer.hasTile(key) || inflight.has(key)) continue;
        inflight.add(key);
        DotDensityWorker!.getTileBuffers(tile.z, tile.x, tile.y)
          .then(buffers => {
            if (alive && buffers) {
              layer.setTileData(tile, buffers);
              if (!rowIndex) refreshRowIndex();
              applyDensities(key, buffers.paths, buffers.areas);
              map.triggerRepaint();
            }
          })
          .catch(e => console.warn('[dotdensity] tile failed', key, e))
          .finally(() => inflight.delete(key));
      }
    };

    // Basemap changes rebuild the style and drop custom layers; re-add.
    const onStyleData = () => addLayer();
    map.on('moveend', updateCover);
    map.on('zoomend', updateCover);
    map.on('styledata', onStyleData);
    const unsubData = useDemographyStore.subscribe(s => s.dataHash, rebuildAllDensities);
    const unsubVariable = useDemographyStore.subscribe(s => s.variable, rebuildAllDensities);
    refreshRowIndex();
    updateCover();

    return () => {
      alive = false;
      unsubData();
      unsubVariable();
      map.off('moveend', updateCover);
      map.off('zoomend', updateCover);
      map.off('styledata', onStyleData);
      if (map.getLayer(DOT_DENSITY_LAYER_ID)) map.removeLayer(DOT_DENSITY_LAYER_ID);
    };
  }, [enabled, mapRef, tilesPath, parentLayer]);

  return null;
};
