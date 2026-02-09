'use client';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import type {MapFeatureInfo} from '@constants/types';
import {BLOCK_SOURCE_ID} from '@constants/layers';
import {useMapStore} from '@/app/store/mapStore';

export let previousHoverFeatures: Array<MapFeatureInfo> = [];

export const setHoverFeatures = (features?: Array<MapGeoJSONFeature>) => {
  const mapRef = useMapStore.getState().getMapRef();
  if (!mapRef) return;

  const normalizeFeatureRef = (feature: MapGeoJSONFeature): MapFeatureInfo | null => {
    const id = feature.id;
    if (id === undefined || id === null) return null;

    const props = feature.properties ?? {};
    const sourceLayer = props.__sourceLayer || feature.sourceLayer;
    const rawSource = props.__source || feature.source || BLOCK_SOURCE_ID;
    let source = rawSource;

    if (!mapRef.getSource(source)) {
      if (sourceLayer && mapRef.getSource(BLOCK_SOURCE_ID)) {
        source = BLOCK_SOURCE_ID;
      } else {
        return null;
      }
    }

    return {source, sourceLayer, id};
  };

  const hoverFeatures = features
    ? features.map(normalizeFeatureRef).filter((f): f is MapFeatureInfo => Boolean(f))
    : [];

  previousHoverFeatures
    .filter(f => mapRef.getSource(f.source))
    .forEach(f => mapRef.setFeatureState(f, {hover: false}));
  hoverFeatures.forEach(f => mapRef.setFeatureState(f, {hover: true}));
  previousHoverFeatures = hoverFeatures;
};
