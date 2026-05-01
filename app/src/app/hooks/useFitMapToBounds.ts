import {useCallback, useEffect, type MutableRefObject} from 'react';
import type {LngLatBoundsLike, Map} from 'maplibre-gl';
import type {MapRef} from 'react-map-gl/maplibre';
import {useMapControlsStore} from '@store/mapControlsStore';

const FIT_BOUNDS_PADDING = 20;

function syncLastMapViewState(map: Map): void {
  const c = map.getCenter();
  useMapControlsStore.getState().setLastMapViewState({
    longitude: c.lng,
    latitude: c.lat,
    zoom: map.getZoom(),
  });
}

/** Fits when `bounds` or `mapRef` changes; writes `lastMapViewState` on `moveend` after each fit. */
export function useFitMapToBounds(
  mapRef: MutableRefObject<MapRef | null>,
  bounds: LngLatBoundsLike | undefined
): () => void {
  const fitMapToBounds = useCallback(() => {
    if (!mapRef.current || !bounds) return;

    const map = mapRef.current.getMap();
    map.fitBounds(bounds, {padding: FIT_BOUNDS_PADDING});
    map.once('moveend', () => {
      syncLastMapViewState(map);
    });
  }, [mapRef, bounds]);

  useEffect(() => {
    fitMapToBounds();
  }, [fitMapToBounds]);

  return fitMapToBounds;
}
