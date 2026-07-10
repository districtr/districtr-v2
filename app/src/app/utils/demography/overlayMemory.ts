import type {SummaryType} from '@constants/demography/summary';
import type {DemographyVariable} from '@constants/demography/coalition';

/**
 * Last-used choropleth config per layer type, so the Visual settings overlay
 * toggles can restore it after the overlay is turned off. Module state:
 * survives panel unmounts and mode switches, resets on page load.
 */
export const overlayMemory: {
  variables: Partial<Record<SummaryType, DemographyVariable>>;
  lastGroup: SummaryType | null;
} = {variables: {}, lastGroup: null};
