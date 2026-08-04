export const DEMOGRAPHIC_MODES = {
  SIDE_BY_SIDE: 'side-by-side',
  OVERLAY: 'overlay',
  SIZED_CIRCLES: 'sized-circles',
} as const;

export type DemographicMode = (typeof DEMOGRAPHIC_MODES)[keyof typeof DEMOGRAPHIC_MODES];
