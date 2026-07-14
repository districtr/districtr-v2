'use client';
import {useEffect, useMemo} from 'react';
import {useMap} from 'react-map-gl/maplibre';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {getSelectedCoalitionColumns} from '@/app/utils/demography/coalition';
import DotDensityWorker from '@/app/utils/DotDensityWorker';
import {TILESET_URL} from '@/app/utils/api/constants';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {SUMMARY_TYPES} from '@constants/demography/summary';
import {
  getDotDensityCategories,
  type DotDensityCategory,
  type DotDensityUniverse,
} from '@constants/demography/dotDensity';
import {
  coverForBounds,
  dataZoomForMapZoom,
  tileKey,
  type TileID,
} from '@/app/utils/dotDensity/tileMath';
import {DotDensityCustomLayer, DOT_DENSITY_LAYER_ID} from './dotDensityCustomLayer';

const universeForVariable = (variable: string): DotDensityUniverse =>
  variable.includes('vap') ? 'VAP' : 'TOTPOP';

/** The categories currently rendered: coalition (if built) + remaining races. */
export const getActiveDotDensityCategories = (): DotDensityCategory[] => {
  const {variable, coalitionGroups} = useDemographyStore.getState();
  const universe = universeForVariable(variable);
  const coalitionColumns = getSelectedCoalitionColumns({
    selectedGroups: coalitionGroups,
    availableColumns: demographyService.availableColumns,
    universe: universe === 'VAP' ? SUMMARY_TYPES.VAP : SUMMARY_TYPES.TOTPOP,
  });
  return getDotDensityCategories(universe, coalitionColumns);
};

/**
 * path → per-category counts + enabled total, from the client-side demography
 * table. Disabled categories contribute zero counts and drop out of the total,
 * so their dots disappear rather than recolor.
 */
const buildRowIndex = (
  categories: DotDensityCategory[],
  disabled: Set<string>
): Map<string, number[]> | null => {
  const table = demographyService.overlayTable ?? demographyService.table;
  if (!table) return null;
  const available = new Set(table.columnNames());
  const rows = table.objects() as Array<Record<string, unknown>>;
  const index = new Map<string, number[]>();
  for (const row of rows) {
    const path = row.path as string;
    if (!path) continue;
    let total = 0;
    const values = categories.map(cat => {
      if (disabled.has(cat.label)) return 0;
      const count = cat.columns.reduce(
        (sum, c) => sum + (available.has(c) ? Number(row[c]) || 0 : 0),
        0
      );
      total += count;
      return count;
    });
    values.push(total);
    index.set(path, values);
  }
  return index;
};

/** RGBA32F texel data: 2 texels per feature (cats 0-3 | cat4, cat5, total, 0). */
const buildTexels = (
  paths: string[],
  areas: Float64Array,
  rowIndex: Map<string, number[]>,
  categoryCount: number,
  exclude?: Set<string>
): Float32Array => {
  const texels = new Float32Array(paths.length * 8);
  for (let i = 0; i < paths.length; i++) {
    if (exclude?.has(paths[i])) continue;
    const counts = rowIndex.get(paths[i]);
    const area = areas[i];
    if (!counts || !(area > 0)) continue;
    const o = i * 8;
    for (let c = 0; c < categoryCount && c < 6; c++) {
      texels[o + c] = counts[c] / area;
    }
    texels[o + 6] = counts[categoryCount] / area; // enabled-total density
  }
  return texels;
};

/**
 * Mounts the shader-stippled dot density custom layer and keeps its tile set
 * and density textures in sync with the viewport, demography state, coalition
 * builder, category toggles, and shattering. Shattered parents stop stippling;
 * their exposed child blocks are decoded (path-filtered) and stippled at block
 * resolution. Active via the "Dot density" display mode, or ?dotdensity=1.
 */
export const DotDensityLayer: React.FC = () => {
  const mapRef = useMap();
  const tilesPath = useMapStore(state => state.mapDocument?.tiles_s3_path);
  const parentLayer = useMapStore(state => state.mapDocument?.parent_layer);
  const childLayer = useMapStore(state => state.mapDocument?.child_layer);
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
    DotDensityWorker.init(`${TILESET_URL}/${tilesPath}`);

    let alive = true;
    let categories: DotDensityCategory[] = [];
    let rowIndex: Map<string, number[]> | null = null;
    const inflight = new Set<string>();
    // Child tile contents depend on the exposed-children filter. Bumped on
    // every shatter change so in-flight requests made under the old filter
    // are discarded on arrival instead of installing stale geometry.
    let childFilterEpoch = 0;
    const shatteredParents = () => useAssignmentsStore.getState().shatterIds.parents;
    const exposedChildren = () => useAssignmentsStore.getState().shatterIds.children;

    const refreshRowIndex = () => {
      categories = getActiveDotDensityCategories();
      layer.setPalette(categories.map(c => c.hex));
      const disabled = new Set(useDemographyStore.getState().dotDensityDisabled);
      rowIndex = buildRowIndex(categories, disabled);
    };

    const applyDensities = (key: string, paths: string[], areas: Float64Array) => {
      if (!rowIndex) return;
      const exclude = key.startsWith('p:') ? shatteredParents() : undefined;
      layer.setTileDensities(key, buildTexels(paths, areas, rowIndex, categories.length, exclude));
    };

    const rebuildAllDensities = () => {
      if (!alive) return;
      refreshRowIndex();
      if (!rowIndex) return;
      layer.forEachTile(applyDensities);
      map.triggerRepaint();
    };

    const applyDensityFactor = () => {
      if (!alive) return;
      layer.setDensityFactor(useDemographyStore.getState().dotDensityFactor);
      map.triggerRepaint();
    };

    const fetchTile = (
      key: string,
      tile: TileID,
      sourceLayer: string,
      filterPaths?: string[]
    ) => {
      const epoch = childFilterEpoch;
      const isChild = key.startsWith('c:');
      let stale = false;
      inflight.add(key);
      DotDensityWorker!.getTileBuffers(tile.z, tile.x, tile.y, sourceLayer, filterPaths)
        .then(buffers => {
          if (!alive) return;
          if (isChild && epoch !== childFilterEpoch) {
            stale = true;
            return;
          }
          if (buffers) {
            layer.setTileData(key, tile, buffers);
            if (!rowIndex) refreshRowIndex();
            applyDensities(key, buffers.paths, buffers.areas);
            map.triggerRepaint();
          }
        })
        .catch(e => console.warn('[dotdensity] tile failed', key, e))
        .finally(() => {
          inflight.delete(key);
          // The shatter-time updateCover skipped this key while it was
          // inflight; refetch now that the slot is free.
          if (stale && alive) updateCover();
        });
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
      const children = childLayer ? Array.from(exposedChildren()) : [];
      const wanted = new Set<string>();
      for (const tile of cover) {
        wanted.add(`p:${tileKey(tile)}`);
        if (children.length) wanted.add(`c:${tileKey(tile)}`);
      }
      for (const key of layer.tileKeys()) {
        if (!wanted.has(key)) layer.removeTile(key);
      }
      for (const tile of cover) {
        const pKey = `p:${tileKey(tile)}`;
        if (!layer.hasTile(pKey) && !inflight.has(pKey)) {
          fetchTile(pKey, tile, parentLayer);
        }
        if (children.length && childLayer) {
          const cKey = `c:${tileKey(tile)}`;
          if (!layer.hasTile(cKey) && !inflight.has(cKey)) {
            fetchTile(cKey, tile, childLayer, children);
          }
        }
      }
    };

    const onShatterChange = () => {
      if (!alive) return;
      // Child tile contents depend on the exposed-id filter: invalidate
      // in-flight requests, then drop resident tiles and refetch
      childFilterEpoch++;
      for (const key of layer.tileKeys()) {
        if (key.startsWith('c:')) layer.removeTile(key);
      }
      // Zero the newly shattered parents (or restore healed ones)
      if (!rowIndex) refreshRowIndex();
      if (rowIndex) layer.forEachTile(applyDensities);
      updateCover();
      map.triggerRepaint();
    };

    // Basemap changes rebuild the style and drop custom layers; re-add.
    const onStyleData = () => addLayer();
    map.on('moveend', updateCover);
    map.on('zoomend', updateCover);
    map.on('styledata', onStyleData);
    const subs = [
      useDemographyStore.subscribe(s => s.dataHash, rebuildAllDensities),
      useDemographyStore.subscribe(s => s.variable, rebuildAllDensities),
      useDemographyStore.subscribe(s => s.coalitionHash, rebuildAllDensities),
      useDemographyStore.subscribe(s => s.dotDensityDisabled, rebuildAllDensities),
      useDemographyStore.subscribe(s => s.dotDensityFactor, applyDensityFactor),
      useAssignmentsStore.subscribe(s => s.shatterIds, onShatterChange),
    ];
    refreshRowIndex();
    applyDensityFactor();
    updateCover();

    return () => {
      alive = false;
      subs.forEach(unsub => unsub());
      map.off('moveend', updateCover);
      map.off('zoomend', updateCover);
      map.off('styledata', onStyleData);
      if (map.getLayer(DOT_DENSITY_LAYER_ID)) map.removeLayer(DOT_DENSITY_LAYER_ID);
    };
  }, [enabled, mapRef, tilesPath, parentLayer, childLayer]);

  return null;
};
