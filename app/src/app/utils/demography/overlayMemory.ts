import type {SummaryType} from '@constants/demography/summary';
import type {DemographyVariable} from '@constants/demography/coalition';
import {useDemographyStore} from '@store/demography/demographyStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {DEMOGRAPHIC_MODES, type DemographicMode} from '@constants/map/demographicMode';

/**
 * Last-used choropleth config per layer type, so the Visual settings overlay
 * toggles can restore it after the overlay is turned off. Module state:
 * survives panel unmounts and mode switches, resets on page load.
 */
export const overlayMemory: {
  variables: Partial<Record<SummaryType, DemographyVariable>>;
  lastGroup: SummaryType | null;
  /** Overlay-mode preset captured when the overlay is toggled off from Visual
   * settings, restored on the next activation — so the toggles round-trip the
   * same opacity/painted-districts state the panel controls set. */
  overlayOpacity: number | null;
  showPaintedDistricts: boolean | null;
  /** The most recently used display mode (overlay vs. side-by-side comparison),
   * so activating a choropleth layer reuses the user's last choice. */
  displayMode: DemographicMode | null;
} = {
  variables: {},
  lastGroup: null,
  overlayOpacity: null,
  showPaintedDistricts: null,
  displayMode: null,
};

/**
 * Turn the choropleth overlay on for a column group, restoring the last-used
 * variable (or defaulting to the group's first). The single writer of
 * overlayMemory's activation state — used by the Visual settings toggles and
 * the sidebar Map Layer tabs. No-op (returns false) when the group has no
 * variables on this map, so a data-less group can never activate a foreign
 * variable or poison the memory.
 */
export const activateOverlayGroup = (group: SummaryType): boolean => {
  const demography = useDemographyStore.getState();
  const variables = demography.availableColumnSets.map[group] ?? [];
  if (!variables.length) return false;
  let variable = demography.variable;
  if (!variables.some(v => v.value === variable)) {
    variable = overlayMemory.variables[group] ?? variables[0].value;
    demography.setVariable(variable);
  }
  overlayMemory.lastGroup = group;
  overlayMemory.variables[group] = variable;
  // Reuse the last-used display mode; side-by-side is a Super Draw feature,
  // so plain Draw always falls back to the overlay.
  const displayMode =
    overlayMemory.displayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE &&
    useToolbarStore.getState().superDraw
      ? DEMOGRAPHIC_MODES.SIDE_BY_SIDE
      : DEMOGRAPHIC_MODES.OVERLAY;
  useMapControlsStore.getState().setMapOptions({
    demographicDisplayMode: displayMode,
    ...(overlayMemory.overlayOpacity !== null && {overlayOpacity: overlayMemory.overlayOpacity}),
    ...(overlayMemory.showPaintedDistricts !== null && {
      showPaintedDistricts: overlayMemory.showPaintedDistricts,
    }),
  });
  return true;
};
