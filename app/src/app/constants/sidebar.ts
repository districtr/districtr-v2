export const SIDEBAR_PANELS = {
  LAYERS: 'layers',
  POPULATION: 'population',
  DEMOGRAPHY: 'demography',
  ELECTION: 'election',
  MAP_VALIDATION: 'mapValidation',
  OVERLAYS: 'overlays',
} as const;

export type SidebarPanel = (typeof SIDEBAR_PANELS)[keyof typeof SIDEBAR_PANELS];
