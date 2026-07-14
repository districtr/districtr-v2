/**
 * Constants for the procedural (shader-stippled) dot density layer.
 *
 * The stipple grid is a global power-of-two subdivision of the mercator
 * [0,1]² world: at grid level n, cells are 2^-n world units wide. Dot
 * positions are hashed from world-stable integer cell ids, so dots never
 * move under pan/zoom.
 */

/** Target stipple cell size in CSS pixels; controls dot spacing on screen. */
export const DOT_DENSITY_CELL_PX = 6;

/**
 * Dot radius as a fraction of a cell. Centers jitter across the whole cell
 * and discs may overlap neighbors (kept < 1 so the shader's 3×3 neighborhood
 * search finds every covering dot).
 */
export const DOT_DENSITY_DOT_RADIUS = 0.38;

/**
 * Max dots a single stipple cell can hold. Cells draw ceil(expected) dots up
 * to this cap with random positions and stacking, so dense areas read as
 * chaotic overlapping clusters instead of a saturated one-dot-per-cell grid.
 */
export const DOT_DENSITY_MAX_DOTS_PER_CELL = 3;

/**
 * Anchor for the people-per-dot policy: ppd = 2^(anchor - gridLevel).
 * Grid level ≈ zoom + 6, so this gives ~250 people/dot at state view and
 * 1 person/dot from ~z14 up. The user-facing density factor divides into it.
 * ponytail: tuned by eyeball for CO VTDs; revisit with real calibration
 */
export const DOT_DENSITY_PPD_ANCHOR_LEVEL = 20;

export type DotDensityUniverse = 'TOTPOP' | 'VAP';

export type DotDensityCategory = {
  label: string;
  hex: string;
  columns: string[];
};

/**
 * Base race categories rendered as dot colors, with their column per
 * universe. Palette follows the classic Racial Dot Map convention
 * (Cooper Center 2013 → CNN → Dave's Redistricting): White blue,
 * Black green, Asian red, Hispanic orange — familiar to redistricting
 * users. AMIN takes the classic brown "other" slot; Other goes gray.
 */
export const DOT_DENSITY_BASE_CATEGORIES: Array<{
  label: string;
  hex: string;
  columns: Record<DotDensityUniverse, string>;
}> = [
  {label: 'White', hex: '#4E79C7', columns: {TOTPOP: 'white_pop_20', VAP: 'white_vap_20'}},
  {label: 'Black', hex: '#2E9940', columns: {TOTPOP: 'bpop_20', VAP: 'bvap_20'}},
  {label: 'Hispanic', hex: '#F5A623', columns: {TOTPOP: 'hpop_20', VAP: 'hvap_20'}},
  {
    label: 'Asian/NHPI',
    hex: '#D62F27',
    columns: {TOTPOP: 'asian_nhpi_pop_20', VAP: 'asian_nhpi_vap_20'},
  },
  {label: 'AMIN', hex: '#8B6C42', columns: {TOTPOP: 'amin_pop_20', VAP: 'amin_vap_20'}},
  {label: 'Other', hex: '#767676', columns: {TOTPOP: 'other_pop_20', VAP: 'other_vap_20'}},
];

/** Color for the Coalition Builder merged category. */
export const DOT_DENSITY_COALITION_HEX = '#7C3AED';

export const hexToRgb01 = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/**
 * The categories currently rendered, in texture-slot order. When Coalition
 * Builder columns are active they merge into a single leading Coalition
 * category and the member races drop out (no double counting). Always ≤ 6
 * entries (the shader's slot count).
 */
export const getDotDensityCategories = (
  universe: DotDensityUniverse,
  coalitionColumns: string[]
): DotDensityCategory[] => {
  const coalition = new Set(coalitionColumns);
  const base = DOT_DENSITY_BASE_CATEGORIES.filter(
    cat => !coalition.has(cat.columns[universe])
  ).map(cat => ({label: cat.label, hex: cat.hex, columns: [cat.columns[universe]]}));
  return coalition.size
    ? [{label: 'Coalition', hex: DOT_DENSITY_COALITION_HEX, columns: coalitionColumns}, ...base]
    : base;
};

/** Range of the user-facing dot density multiplier. */
export const DOT_DENSITY_FACTOR_MIN = 0.5;
export const DOT_DENSITY_FACTOR_MAX = 24;

/** Width in texels of the per-tile density textures (2 texels per feature). */
export const DOT_DENSITY_TEXTURE_WIDTH = 1024;

/** Data zoom bounds of the districtr tilesets (tippecanoe -Z3 -z12). */
export const DOT_DENSITY_MIN_DATA_ZOOM = 3;
export const DOT_DENSITY_MAX_DATA_ZOOM = 12;

/** Cap on tiles fetched per cover computation, to bound memory/decode work. */
export const DOT_DENSITY_MAX_COVER_TILES = 64;
