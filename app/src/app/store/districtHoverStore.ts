'use client';
import {create} from 'zustand';

// Reactive mirror of useDistrictHover's feature-state writes, so
// PublicDistrictLayers can render a dim mask over non-hovered districts
// without threading hover state through props.
interface DistrictHoverStore {
  hoveredZones: string[];
  setHoveredZones: (zones: string[]) => void;
}

export const useDistrictHoverStore = create<DistrictHoverStore>(set => ({
  hoveredZones: [],
  setHoveredZones: zones => set({hoveredZones: zones}),
}));
