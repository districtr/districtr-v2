'use client';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import type {MapFeatureInfo} from '@constants/types';
import {devToolsConfig, devwrapper} from './middlewareConfig';

export interface HoverFeatureStore {
  // HOVERING
  /**
   * Features that area highlighted and hovered.
   * Map render effects in `mapRenderSubs` -> `_hoverMapSideEffectRender`
   */
  hoverFeatures: Array<MapFeatureInfo>;
  setHoverFeatures: (features?: Array<MapGeoJSONFeature>) => void;
}

export var useHoverStore = create(
  devwrapper(
    subscribeWithSelector<HoverFeatureStore>((set, get) => ({
      hoverFeatures: [],
      setHoverFeatures: _features => {
        const hoverFeatures = _features
          ? _features.map(f => ({
            source: f.source,
              sourceLayer: f.sourceLayer,
              id: f.id,
            }))
          : [];

        set({hoverFeatures});
      },
    })),

    {
      ...devToolsConfig,
      name: "Districtr Hover Feature Store"
    }
  )
  // TODO: Zustand is releasing a major version bump and we have breaking issues
);