import {SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import type {DemographyVariable} from '@constants/demography/coalition';
import {useDemographyStore} from '@store/demography/demographyStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {DEMOGRAPHIC_MODES, type DemographicMode} from '@constants/map/demographicMode';

/**
 * The two top-level choropleth overlay toggles. Coarser than SummaryType:
 * the population overlay spans both the TOTPOP and VAP statistical
 * universes as one merged control, not two.
 */
export type OverlayGroup = 'demography' | 'election';

const GROUP_SUMMARY_TYPES: Record<OverlayGroup, SummaryType[]> = {
  demography: [SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP],
  election: [SUMMARY_TYPES.VOTERHISTORY],
};

/** Which overlay group a statistical universe's variables belong to. */
export const toOverlayGroup = (summaryType: SummaryType): OverlayGroup =>
  summaryType === SUMMARY_TYPES.VOTERHISTORY ? 'election' : 'demography';

/** Every variable available on this map for an overlay group's universe(s). */
export const overlayGroupVariables = (group: OverlayGroup) =>
  GROUP_SUMMARY_TYPES[group].flatMap(
    summaryType => useDemographyStore.getState().availableColumnSets.map[summaryType] ?? []
  );

/**
 * Last-used choropleth variable per overlay group, so the Visual settings
 * overlay toggles can restore it after the overlay is turned off. Module
 * state: survives panel unmounts and mode switches, resets on page load.
 */
export const overlayMemory: {
  demographyVariable: DemographyVariable | null;
  electionVariable: DemographyVariable | null;
  /** Overlay-mode preset captured when the overlay is toggled off from Visual
   * settings, restored on the next activation — so the toggles round-trip the
   * same opacity/painted-districts state the panel controls set. */
  overlayOpacity: number | null;
  showPaintedDistricts: boolean | null;
  /** The most recently used display mode (overlay vs. side-by-side comparison),
   * so activating a choropleth layer reuses the user's last choice. */
  displayMode: DemographicMode | null;
} = {
  demographyVariable: null,
  electionVariable: null,
  overlayOpacity: null,
  showPaintedDistricts: null,
  displayMode: null,
};

export const getOverlayVariable = (group: OverlayGroup): DemographyVariable | null =>
  group === 'election' ? overlayMemory.electionVariable : overlayMemory.demographyVariable;

export const setOverlayVariable = (group: OverlayGroup, variable: DemographyVariable): void => {
  if (group === 'election') overlayMemory.electionVariable = variable;
  else overlayMemory.demographyVariable = variable;
};

/**
 * Turn the choropleth overlay on for an overlay group, restoring the
 * last-used variable (or defaulting to the group's first). The single
 * writer of overlayMemory's activation state — used by the Visual settings
 * toggles and the sidebar Map Layer tabs. No-op (returns false) when the
 * group has no variables on this map, so a data-less group can never
 * activate a foreign variable or poison the memory.
 */
export const activateOverlayGroup = (group: OverlayGroup): boolean => {
  const demography = useDemographyStore.getState();
  const variables = overlayGroupVariables(group);
  if (!variables.length) return false;
  let variable = demography.variable;
  if (!variables.some(v => v.value === variable)) {
    variable = getOverlayVariable(group) ?? variables[0].value;
    demography.setVariable(variable);
  }
  setOverlayVariable(group, variable);
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
