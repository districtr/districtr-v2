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

/** Singular, human-friendly unit names for instructional copy (e.g. the break
 * tool's "Choose a precinct to break down into blocks" prompt). */
export const GEO_UNIT_SINGULAR_NAMES: Record<GeoUnit, string> = {
  [GEO_UNITS.VTD]: 'precinct',
  [GEO_UNITS.BLOCK_GROUP]: 'block group',
  [GEO_UNITS.BLOCK]: 'block',
};
