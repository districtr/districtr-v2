import {create} from 'zustand';

type UnassignedFeatureStore = {
  selectedIndex: number | null;
  setSelectedIndex: (index: number | null) => void;
  reset: () => void;
};

export const useUnassignFeaturesStore = create<UnassignedFeatureStore>(set => ({
  selectedIndex: null,
  setSelectedIndex: (index: number | null) => set({selectedIndex: index}),
  reset: () => set({selectedIndex: null}),
}));
