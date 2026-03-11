import {MutableRefObject, useEffect, useRef} from 'react';
import {MapRef} from 'react-map-gl/maplibre';
import {MapRenderSubscriber} from '../utils/map/mapRenderSubs';
import {useMapStore} from '../store/mapStore';
import {useDemographyStore} from '../store/demography/demographyStore';
import {useVisibilityState} from './useVisibilityState';
import {useMapControlsStore} from '../store/mapControlsStore';
import {useAssignmentsStore} from '../store/assignmentsStore';

export const useMapRenderer = (mapType: 'demographic' | 'main' = 'main') => {
  const mapRef = useRef<MapRef | null>(null);
  const renderer = useRef<MapRenderSubscriber | null>(null);
  const {isVisible} = useVisibilityState();
  const onLoad = (e: maplibregl.MapLibreEvent) => {
    if (!mapRef.current) {
      mapRef.current = {getMap: () => e.target} as MapRef;
    }
    const renderSubscriber = new MapRenderSubscriber(
      mapRef.current.getMap(),
      mapType,
      useMapStore,
      useDemographyStore,
      useMapControlsStore,
      useAssignmentsStore
    );
    renderSubscriber.subscribe();
    requestAnimationFrame(() => {
      renderer.current?.checkRender();
    });
    renderer.current = renderSubscriber;
    // This is paranoid
    // On every idle, it checks the map state
    // This takes like 0.1ms to run, so it's not a big deal
    mapRef.current.getMap().on('idle', () => {
      // request animation frame
      requestAnimationFrame(() => {
        renderer.current?.checkRender();
      });
    });
  };

  useEffect(() => {
    return () => {
      renderer.current?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isVisible && renderer.current) {
      requestAnimationFrame(() => {
        renderer.current?.checkRender();
      });
    }
  }, [isVisible]);

  return {
    onLoad,
    renderer,
    mapRef,
  };
};
