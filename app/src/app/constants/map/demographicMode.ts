export const DEMOGRAPHIC_MODES = {
  SIDE_BY_SIDE: 'side-by-side',
  OVERLAY: 'overlay',
} as const;

export type DemographicMode = (typeof DEMOGRAPHIC_MODES)[keyof typeof DEMOGRAPHIC_MODES];
