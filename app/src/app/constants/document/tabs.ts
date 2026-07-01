export const MAP_TABS = {
  DISTRICTS: 'districts',
  COMMUNITY: 'communities',
} as const;
export type MapTab = (typeof MAP_TABS)[keyof typeof MAP_TABS];

export const MAP_TAB_LABELS: Record<MapTab, string> = {
  [MAP_TABS.DISTRICTS]: 'district',
  [MAP_TABS.COMMUNITY]: 'community',
} as const;

export const MAP_TAB_LABEL_PLURAL: Record<MapTab, string> = {
  [MAP_TABS.DISTRICTS]: 'districts',
  [MAP_TABS.COMMUNITY]: 'communities',
} as const;
