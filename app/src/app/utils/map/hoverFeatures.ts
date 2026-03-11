'use client';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import type {MapFeatureInfo} from '@constants/types';
import {useMapStore} from '@/app/store/mapStore';

export let previousHoverFeatures: Array<MapFeatureInfo> = [];

export const setHoverFeatures = (features?: Array<MapGeoJSONFeature>) => {
  const hoverFeatures = features
    ? features.map(f => ({
        source: f.properties.__source || f.source,
        sourceLayer: f.properties.__sourceLayer || f.sourceLayer,
        id: f.id,
      }))
    : [];
  const mapRef = useMapStore.getState().getMapRef();
  if (!mapRef) return;
  previousHoverFeatures.forEach(f => {
    mapRef.setFeatureState(f, {hover: false});
  });
  hoverFeatures.forEach(f => {
    mapRef.setFeatureState(f, {hover: true});
  });
  previousHoverFeatures = hoverFeatures;
};
