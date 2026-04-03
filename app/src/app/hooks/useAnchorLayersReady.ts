'use client';
import {MutableRefObject, useEffect, useState} from 'react';
import type {MapRef} from 'react-map-gl/maplibre';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';

export const useAnchorLayersReady = (
  mapRef: MutableRefObject<MapRef | null>,
  isMapLoaded: boolean,
  basemap: string | undefined
) => {
  const [areAnchorLayersReady, setAreAnchorLayersReady] = useState(false);

  useEffect(() => {
    if (!isMapLoaded) {
      setAreAnchorLayersReady(false);
      return;
    }

    setAreAnchorLayersReady(false);
    let frameId = 0;

    const checkForAnchorLayer = () => {
      const map = mapRef.current?.getMap();
      if (map?.getLayer(MAP_LAYER_ANCHOR_IDS.assignments)) {
        setAreAnchorLayersReady(true);
        return;
      }
      frameId = requestAnimationFrame(checkForAnchorLayer);
    };

    frameId = requestAnimationFrame(checkForAnchorLayer);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [basemap, isMapLoaded, mapRef]);

  return areAnchorLayersReady;
};
