'use client';
import {useLayoutEffect, useState} from 'react';
import {MAP_MODE_DEFAULT_OPTIONS} from '@constants/map/mapModeDefaults';
import {type MapMode} from '@constants/map/mode';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

export const useInitializeMapMode = (mode: MapMode) => {
  const setMapMode = useMapControlsStore(state => state.setMapMode);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const [isMapModeReady, setIsMapModeReady] = useState(false);

  useLayoutEffect(() => {
    setMapMode(mode);
    setMapOptions(MAP_MODE_DEFAULT_OPTIONS[mode]);
    setIsMapModeReady(true);
  }, [mode, setMapMode, setMapOptions]);

  return isMapModeReady;
};
