export const GEO_UNITS = {
  VTD: 'vtd',
  BLOCK_GROUP: 'bg',
  BLOCK: 'block',
} as const;

export type GeoUnit = (typeof GEO_UNITS)[keyof typeof GEO_UNITS];

export const GEO_UNIT_LABELS: Record<GeoUnit, string> = {
  [GEO_UNITS.VTD]: 'VTDs',
  [GEO_UNITS.BLOCK_GROUP]: 'block groups',
  [GEO_UNITS.BLOCK]: 'blocks',
};
