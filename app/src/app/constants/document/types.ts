export const MAP_TYPES = {
  DEFAULT: 'default',
  // TODO: local should be something more description like 'small-town' or 'locality' or ???
  LOCAL: 'local',
  COMMUNITY: 'community',
} as const;

export type MapType = (typeof MAP_TYPES)[keyof typeof MAP_TYPES];
