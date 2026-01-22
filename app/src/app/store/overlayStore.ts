'use client';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {Overlay} from '@utils/api/apiHandlers/types';
import {getMapOverlays} from '@utils/api/apiHandlers/getOverlays';

export interface OverlayStore {
  availableOverlays: Overlay[];
  enabledOverlayIds: Set<string>;
  isLoading: boolean;
  setAvailableOverlays: (overlays: Overlay[]) => void;
  toggleOverlay: (overlayId: string) => void;
  enableOverlay: (overlayId: string) => void;
  disableOverlay: (overlayId: string) => void;
  clearOverlays: () => void;
  fetchOverlays: (districtrMapSlug: string) => Promise<void>;
}

export const useOverlayStore = create(
  subscribeWithSelector<OverlayStore>((set, get) => ({
    availableOverlays: [],
    enabledOverlayIds: new Set<string>(),
    isLoading: false,

    setAvailableOverlays: (overlays: Overlay[]) => {
      set({availableOverlays: overlays});
    },

    toggleOverlay: (overlayId: string) => {
      const {enabledOverlayIds} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      if (newEnabledIds.has(overlayId)) {
        newEnabledIds.delete(overlayId);
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
      const {enabledOverlayIds} = get();
      const newEnabledIds = new Set(enabledOverlayIds);
      newEnabledIds.delete(overlayId);
      set({enabledOverlayIds: newEnabledIds});
    },

    clearOverlays: () => {
      set({
        availableOverlays: [],
        enabledOverlayIds: new Set<string>(),
        isLoading: false,
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
  }))
);
