'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {Overlay} from '@utils/api/apiHandlers/types';
import {getMapOverlays} from '@utils/api/apiHandlers/getOverlays';
import { useMapStore } from './mapStore';

export interface OverlayPaintConstraint {
  overlayId: string;
  featureId: string;
  geometry: GeoJSON.Geometry;
  featureName?: string;
}

export interface OverlayStore {
  availableOverlays: Overlay[];
  _idCache: Map<string, boolean>;
  enabledOverlayIds: Set<string>;
  isLoading: boolean;
  paintConstraint: OverlayPaintConstraint | null;
  hoveredOverlayFeature: {overlayId: string; featureId: string} | null;
  setAvailableOverlays: (overlays: Overlay[]) => void;
  toggleOverlay: (overlayId: string) => void;
  enableOverlay: (overlayId: string) => void;
  disableOverlay: (overlayId: string) => void;
  clearOverlays: () => void;
  fetchOverlays: (districtrMapSlug: string) => Promise<void>;
  setPaintConstraint: (constraint: OverlayPaintConstraint | null) => void;
  selectOverlayFeature: (overlayId: string) => void;
  clearPaintConstraint: () => void;
  setHoveredOverlayFeature: (feature: {overlayId: string; featureId: string} | null) => void;
}

export const useOverlayStore = create(
  subscribeWithSelector<OverlayStore>((set, get) => ({
    availableOverlays: [],
    _idCache: new Map<string, boolean>(),
    enabledOverlayIds: new Set<string>(),
    isLoading: false,
    paintConstraint: null,
    hoveredOverlayFeature: null,

    setAvailableOverlays: (overlays: Overlay[]) => {
      set({availableOverlays: overlays});
    },

    toggleOverlay: (overlayId: string) => {
      const {enabledOverlayIds, paintConstraint} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      if (newEnabledIds.has(overlayId)) {
        newEnabledIds.delete(overlayId);
        // Clear constraint if its overlay is disabled
        if (paintConstraint?.overlayId === overlayId) {
          set({enabledOverlayIds: newEnabledIds, paintConstraint: null});
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
      const {enabledOverlayIds, paintConstraint} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      newEnabledIds.delete(overlayId);
      // Clear constraint if its overlay is disabled
      if (paintConstraint?.overlayId === overlayId) {
        set({enabledOverlayIds: newEnabledIds, paintConstraint: null, _idCache: new Map<string, boolean>()});
      } else {
        set({enabledOverlayIds: newEnabledIds});
      }
    },

    clearOverlays: () => {
      set({
        availableOverlays: [],
        enabledOverlayIds: new Set<string>(),
        isLoading: false,
        paintConstraint: null,
        hoveredOverlayFeature: null,
        _idCache: new Map<string, boolean>(),
      });
    },

    fetchOverlays: async (districtrMapSlug: string) => {
      set({isLoading: true});
      try {
        const result = await getMapOverlays(districtrMapSlug);
        if (result.ok) {
          set({availableOverlays: result.response, isLoading: false});
        } else {
          console.error('Failed to fetch overlays:', result.error);
          set({availableOverlays: [], isLoading: false});
        }
      } catch (error) {
        console.error('Error fetching overlays:', error);
        set({availableOverlays: [], isLoading: false});
      }
    },

    setPaintConstraint: (constraint: OverlayPaintConstraint | null) => {
      console.log('setting paint constraint', constraint);
      set({paintConstraint: constraint, _idCache: new Map<string, boolean>()});
    },

    clearPaintConstraint: () => {
      set({paintConstraint: null});
    },

    setHoveredOverlayFeature: (feature: {overlayId: string; featureId: string} | null) => {
      set({hoveredOverlayFeature: feature});
    },

    selectOverlayFeature: (
      overlayId,
    ) => {
      const mapRef = useMapStore.getState().getMapRef();
      if (!mapRef) return;
      const callback = (e: any) => {
        const features = mapRef.queryRenderedFeatures(e.point, {layers: [`overlay-click-${overlayId}`]});
        if (features.length > 0) {
          const feature = features[0];
          console.log('selected overlay feature', feature);
          set({paintConstraint: {overlayId, featureId: feature.id as string, geometry: feature.geometry as GeoJSON.Geometry}});
        }
      }
      mapRef.once('click', callback);
    }
  }))
);
