'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {Overlay} from '@utils/api/apiHandlers/types';
import {useMapStore} from './mapStore';
import {dissolve} from '@turf/turf';
import {Feature, MapGeoJSONFeature} from 'maplibre-gl';

export interface OverlayPaintConstraint {
  overlayId: string;
  featureId: string;
  features: MapGeoJSONFeature[];
  featureName?: string;
}

export interface OverlayStore {
  _idCache: Map<string, boolean>;
  enabledOverlayIds: Set<string>;
  paintConstraint: OverlayPaintConstraint | null;
  selectingLayerId: string | null;
  toggleOverlay: (overlayId: string) => void;
  enableOverlay: (overlayId: string) => void;
  disableOverlay: (overlayId: string) => void;
  setPaintConstraint: (
    overlayId: string,
    featureId: string
  ) => void;
  selectOverlayFeature: (overlayId: string) => void;
  clearPaintConstraint: () => void;
}

export const useOverlayStore = create(
  subscribeWithSelector<OverlayStore>((set, get) => ({
    _idCache: new Map<string, boolean>(),
    enabledOverlayIds: new Set<string>(),
    paintConstraint: null,
    selectingLayerId: null,

    toggleOverlay: (overlayId: string) => {
      const {enabledOverlayIds, paintConstraint, clearPaintConstraint} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      if (newEnabledIds.has(overlayId)) {
        newEnabledIds.delete(overlayId);
        // Clear constraint if its overlay is disabled
        if (paintConstraint?.overlayId === overlayId) {
          set({enabledOverlayIds: newEnabledIds});
          clearPaintConstraint();
          return;
        }
      } else {
        newEnabledIds.add(overlayId);
      }
      set({enabledOverlayIds: newEnabledIds});
    },

    enableOverlay: (overlayId: string) => {
      const {enabledOverlayIds} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      newEnabledIds.add(overlayId);
      set({enabledOverlayIds: newEnabledIds});
    },

    disableOverlay: (overlayId: string) => {
      const {enabledOverlayIds, paintConstraint, clearPaintConstraint} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      newEnabledIds.delete(overlayId);
      // Clear constraint if its overlay is disabled
      if (paintConstraint?.overlayId === overlayId) {
        clearPaintConstraint();
      } else {
        set({enabledOverlayIds: newEnabledIds});
      }
    },

    setPaintConstraint: (overlayId: string, featureId: string) => {
      const clearPaintConstraint = get().clearPaintConstraint;
      if (!overlayId || !featureId) {
        clearPaintConstraint();
        return;
      }
      const mapRef = useMapStore.getState().getMapRef();
      if (!mapRef) {
        clearPaintConstraint();
        return;
      }
      // query source layer for feature id
      const sourceFeatures = mapRef?.querySourceFeatures(`overlay-source-${overlayId}`);
      const matchingFeatures = sourceFeatures?.filter(
        (feature: any) => feature.id === featureId
      );
      if (matchingFeatures && matchingFeatures.length > 0) {
        set({
          paintConstraint: {
            overlayId: overlayId,
            featureId: featureId,
            // Reference needs to be made into a new object since
            // this comes from a worker
            features: matchingFeatures.map(f => ({
              ...f,
              geometry: f._geometry,
            })) as MapGeoJSONFeature[],
          },
          _idCache: new Map<string, boolean>(),
          selectingLayerId: null,
        });
        return;
      } else {
        clearPaintConstraint();
      }
    },

    clearPaintConstraint: () => {
      set({
        paintConstraint: null,
        _idCache: new Map<string, boolean>(),
        selectingLayerId: null,
      });
    },

    selectOverlayFeature: overlayId => {
      set({selectingLayerId: overlayId});
    },
  }))
);
