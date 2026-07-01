export const MAP_MODES = {
  DISTRICTS: 'districts',
  COI: 'coi',
} as const;

export type MapMode = (typeof MAP_MODES)[keyof typeof MAP_MODES];

export const MAP_MODE_LABELS: Record<MapMode, string> = {
  [MAP_MODES.DISTRICTS]: 'district',
  [MAP_MODES.COI]: 'community',
} as const;

export const MAP_MODE_LABEL_PLURAL: Record<MapMode, string> = {
  [MAP_MODES.DISTRICTS]: 'districts',
  [MAP_MODES.COI]: 'communities',
} as const;
