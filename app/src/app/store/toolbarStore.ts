import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import {ACTIVE_TOOLS, SUPER_DRAW_TOOLS} from '@constants/map/tools';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {MAP_MODE_DEFAULT_OPTIONS} from '@constants/map/mapModeDefaults';
import {DEFAULT_MAP_OPTIONS, useMapControlsStore} from './mapControlsStore';

export type ToolbarState = {
  // Super Draw exposes the full editing toolset; plain Draw hides the advanced
  // tools/settings. Persisted so a user's choice sticks across sessions.
  superDraw: boolean;
  setSuperDraw: (superDraw: boolean) => void;
};

export const useToolbarStore = create(
  persist<ToolbarState>(
    set => ({
      superDraw: false,
      setSuperDraw: superDraw => {
        set({superDraw});
        if (superDraw) return;
        // Leaving Super Draw: back out of super-only state so the user isn't
        // stranded on a hidden tool or a setting Draw has no control for.
        // Draw mode always runs on the global defaults for these.
        const controls = useMapControlsStore.getState();
        if (SUPER_DRAW_TOOLS.includes(controls.activeTool)) {
          controls.setActiveTool(ACTIVE_TOOLS.PAN);
        }
        const {demographicDisplayMode} = controls.mapOptions;
        controls.setMapOptions({
          basemap: MAP_MODE_DEFAULT_OPTIONS[controls.mapMode].basemap,
          showPopulationNumbers: DEFAULT_MAP_OPTIONS.showPopulationNumbers,
          showBlockPopulationNumbers: DEFAULT_MAP_OPTIONS.showBlockPopulationNumbers,
          highlightBrokenDistricts: DEFAULT_MAP_OPTIONS.highlightBrokenDistricts,
          zonesOpacity: DEFAULT_MAP_OPTIONS.zonesOpacity,
          demographicDisplayMode:
            demographicDisplayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE
              ? DEMOGRAPHIC_MODES.OVERLAY
              : demographicDisplayMode,
        });
      },
    }),
    {
      name: 'toolbarStore',
      // v3 drops the legacy toolbar layout state and the toolbar-size picker
      // (the size is a fixed constant now); only the mode choice persists.
      version: 3,
      // @ts-ignore - legacy persisted state had extra fields
      migrate: persistedState => {
        const prev = (persistedState ?? {}) as Partial<ToolbarState>;
        return {superDraw: prev.superDraw ?? false} as ToolbarState;
      },
      // @ts-ignore - persisted state is a partial of ToolbarState
      partialize: state => ({superDraw: state.superDraw}),
    }
  )
);
