import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {DocumentObject} from '@utils/api/apiHandlers/types';

interface FeatureFlagStore {
  boundarySettings: boolean;
  paintCounties: boolean;
  formUrl: string | null;
  debugSelectionPoints: boolean;
  gotFlags: boolean;
  updateData: (mapDocument: DocumentObject | null) => void;
  getFlags: () => Promise<void>;
}

export const useFeatureFlagStore = create(
  subscribeWithSelector<FeatureFlagStore>((set, get) => ({
    boundarySettings: true,
    paintCounties: true,
    formUrl: null,
    debugSelectionPoints: false,
    gotFlags: false,
    getFlags: async () => {
      if (get().gotFlags) return;
      const response = await fetch('/api/env').then(res => res.json());
      set({
        formUrl: response.formUrl,
        debugSelectionPoints: response.debugSelectionPoints,
        gotFlags: true,
      });
    },
    updateData: (mapDocument: DocumentObject | null) => {
      if (!mapDocument) return;
      if (mapDocument.map_type === 'local') {
        set({
          boundarySettings: false,
          paintCounties: false,
        });
      }
    },
  }))
);
