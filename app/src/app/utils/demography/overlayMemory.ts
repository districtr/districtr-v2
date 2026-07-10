import type {SummaryType} from '@constants/demography/summary';
import type {DemographyVariable} from '@constants/demography/coalition';
import {useDemographyStore} from '@store/demography/demographyStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

/**
 * Last-used choropleth config per layer type, so the Visual settings overlay
 * toggles can restore it after the overlay is turned off. Module state:
 * survives panel unmounts and mode switches, resets on page load.
 */
export const overlayMemory: {
  variables: Partial<Record<SummaryType, DemographyVariable>>;
  lastGroup: SummaryType | null;
} = {variables: {}, lastGroup: null};

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
  useMapControlsStore.getState().setMapOptions({demographicDisplayMode: DEMOGRAPHIC_MODES.OVERLAY});
  return true;
};
