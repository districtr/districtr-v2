import {useEffect} from 'react';
import {useMap} from 'react-map-gl/maplibre';
import {BLOCK_SOURCE_ID} from '../constants/layers';

export const useClearMap = (updateTrigger: unknown) => {
  const mapRef = useMap();

  const handleClearCache = (mapRef: maplibregl.Map, state: Record<string, Record<string, any>>) => {
    const sourceLayers = Object.keys(state);
    sourceLayers.forEach(sourceLayer => {
      const layerState = state[sourceLayer];
      const layerStateKeys = Object.keys(layerState);
      layerStateKeys.forEach(id => {
        const property = layerState[id];
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
  };

  useEffect(() => {
    const _mapRef = mapRef?.current?.getMap?.();
    const sourceCaches = _mapRef?.style.sourceCaches[BLOCK_SOURCE_ID];
    if (sourceCaches && _mapRef) {
      const featureStateCache = sourceCaches._state?.state;
      const featureStateChangesCache = sourceCaches._state?.stateChanges;
      handleClearCache(_mapRef, featureStateCache);
      handleClearCache(_mapRef, featureStateChangesCache);
    }
  }, [updateTrigger]);
};
