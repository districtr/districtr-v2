import { MutableRefObject, useEffect, useRef } from "react";
import {MapRef} from 'react-map-gl/maplibre';
import { MapRenderSubscriber } from "../utils/map/mapRenderSubs";
import { useMapStore } from "../store/mapStore";
import { useHoverStore } from "../store/hoverFeatures";
import { useDemographyStore } from "../store/demographicMap";

export const useMapRenderer = (
  mapRef: MutableRefObject<MapRef | null>,
  mapType: 'demographic' | 'main' = 'main'
) => {
  const renderer = useRef<MapRenderSubscriber | null>(null);
  const update = () => {
    if (!mapRef.current) return;
    const renderSubscriber = new MapRenderSubscriber(
      mapRef.current.getMap(),
      mapType,
      useMapStore,
      useHoverStore,
      useDemographyStore
    );
    renderSubscriber.subscribe();
    renderer.current = renderSubscriber;
  }

  useEffect(() => {
    update();
    return () => {
      renderer.current?.unsubscribe();
    }
  },[])

  return {
    update,
    renderer
  }
}