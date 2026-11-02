import type * as maplibregl from 'maplibre-gl';
import {useEffect} from 'react';
import {useMap} from 'react-map-gl/maplibre';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';

export const useClearMap = (updateTrigger: unknown) => {
  const mapRef = useMap();

  const handleClearCache = (mapRef: maplibregl.Map, state: Record<string, Record<string, any>>) => {
    const sourceLayers = Object.keys(state);
    sourceLayers.forEach(sourceLayer => {
      const layerState = state[sourceLayer];
      const layerStateKeys = Object.keys(layerState);
      layerStateKeys.forEach(id => {
        const properties = Object.keys(layerState[id]);
        properties.forEach(property => {
          mapRef.setFeatureState(
            {
              source: BLOCK_SOURCE_ID,
              sourceLayer,
              id,
            },
            {
              [property]: undefined,
            }
          );
        });
      });
    });
  };

  useEffect(() => {
    const _mapRef = mapRef?.current?.getMap?.();
    const tileManager = _mapRef?.style.tileManagers[BLOCK_SOURCE_ID];
    if (tileManager && _mapRef) {
      const featureStateCache = tileManager.getState().state;
      const featureStateChangesCache = tileManager.getState().stateChanges;
      handleClearCache(_mapRef, featureStateCache);
      handleClearCache(_mapRef, featureStateChangesCache);
    }
  }, [updateTrigger]);
};
