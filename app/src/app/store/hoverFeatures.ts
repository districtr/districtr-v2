'use client';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {create} from 'zustand';
import type {MapFeatureInfo} from '@constants/types';
import {setHoverFeatures} from '../utils/map/hoverFeatures';

export interface HoverFeatureStore {
  // HOVERING
  /**
   * Features that area highlighted and hovered.
   * Map render effects in `mapRenderSubs` -> `_hoverMapSideEffectRender`
   */
  hoverFeaturesTimestamp: number;
  setHoverFeatures: (features?: Array<MapGeoJSONFeature>) => void;
}

export const useHoverStore = create<HoverFeatureStore>(set => ({
  hoverFeaturesTimestamp: 0,
  setHoverFeatures: features => {
    setHoverFeatures(features);
    set({hoverFeaturesTimestamp: Date.now()});
  },
}));
