'use client';
import {useEffect, useMemo} from 'react';
import {useMap} from 'react-map-gl/maplibre';
import {useMapStore} from '@/app/store/mapStore';
import DotDensityWorker from '@/app/utils/DotDensityWorker';
import {TILESET_URL} from '@/app/utils/api/constants';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {coverForBounds, dataZoomForMapZoom, tileKey} from '@/app/utils/dotDensity/tileMath';
import {DotDensityCustomLayer, DOT_DENSITY_LAYER_ID} from './dotDensityCustomLayer';

/**
 * Mounts the shader-stippled dot density custom layer and keeps its tile set
 * in sync with the viewport. Phase 1 prototype: parent layer only, monochrome
 * total population, gated behind the ?dotdensity=1 query param.
 */
export const DotDensityLayer: React.FC = () => {
  const mapRef = useMap();
  const tilesPath = useMapStore(state => state.mapDocument?.tiles_s3_path);
  const parentLayer = useMapStore(state => state.mapDocument?.parent_layer);
  const enabled = useMemo(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('dotdensity'),
    []
  );

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
    const inflight = new Set<string>();
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
    updateCover();

    return () => {
      alive = false;
      map.off('moveend', updateCover);
      map.off('zoomend', updateCover);
      map.off('styledata', onStyleData);
      if (map.getLayer(DOT_DENSITY_LAYER_ID)) map.removeLayer(DOT_DENSITY_LAYER_ID);
    };
  }, [enabled, mapRef, tilesPath, parentLayer]);

  return null;
};
