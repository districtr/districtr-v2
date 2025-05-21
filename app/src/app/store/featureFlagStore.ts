import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {DocumentObject} from '@utils/api/apiHandlers/types';

interface FeatureFlagStore {
  boundarySettings: boolean;
  paintCounties: boolean;
  updateData: (mapDocument: DocumentObject | null) => void;
}

export const useFeatureFlagStore = create(
  subscribeWithSelector<FeatureFlagStore>((set, get) => ({
    boundarySettings: true,
    paintCounties: true,
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
