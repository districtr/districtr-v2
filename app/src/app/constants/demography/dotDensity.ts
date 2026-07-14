/**
 * Constants for the procedural (shader-stippled) dot density layer.
 *
 * The stipple grid is a global power-of-two subdivision of the mercator
 * [0,1]² world: at grid level n, cells are 2^-n world units wide. Dot
 * positions are hashed from world-stable integer cell ids, so dots never
 * move under pan/zoom.
 */

/** Target stipple cell size in CSS pixels; controls dot spacing on screen. */
export const DOT_DENSITY_CELL_PX = 7;

/** Dot radius as a fraction of a cell (must stay < 0.5 so discs never cross cells). */
export const DOT_DENSITY_DOT_RADIUS = 0.3;

/**
 * Anchor for the people-per-dot policy: ppd = 2^(anchor - gridLevel).
 * Grid level ≈ zoom + 6, so this gives ~512 people/dot at state view and
 * 1 person/dot from ~z14 up.
 * ponytail: tuned by eyeball for CO VTDs; revisit with real calibration
 */
export const DOT_DENSITY_PPD_ANCHOR_LEVEL = 22;

/**
 * Race categories rendered as dot colors, per universe. Order matters: it is
 * the category index in the shader's density texture and palette.
 */
export const DOT_DENSITY_CATEGORIES = {
  TOTPOP: {
    total: 'total_pop_20',
    columns: [
      'white_pop_20',
      'bpop_20',
      'hpop_20',
      'asian_nhpi_pop_20',
      'amin_pop_20',
      'other_pop_20',
    ],
  },
  VAP: {
    total: 'total_vap_20',
    columns: [
      'white_vap_20',
      'bvap_20',
      'hvap_20',
      'asian_nhpi_vap_20',
      'amin_vap_20',
      'other_vap_20',
    ],
  },
} as const;

export type DotDensityUniverse = keyof typeof DOT_DENSITY_CATEGORIES;

/** Okabe-Ito derived, colorblind-aware; same order as the category columns. */
export const DOT_DENSITY_PALETTE: Array<{label: string; hex: string; rgb: [number, number, number]}> =
  [
    {label: 'White', hex: '#56B4E9', rgb: [0.337, 0.706, 0.914]},
    {label: 'Black', hex: '#009E73', rgb: [0.0, 0.62, 0.451]},
    {label: 'Hispanic', hex: '#E69F00', rgb: [0.902, 0.624, 0.0]},
    {label: 'Asian/NHPI', hex: '#CC79A7', rgb: [0.8, 0.475, 0.655]},
    {label: 'AMIN', hex: '#D55E00', rgb: [0.835, 0.369, 0.0]},
    {label: 'Other', hex: '#999999', rgb: [0.6, 0.6, 0.6]},
  ];

/** Width in texels of the per-tile density textures (2 texels per feature). */
export const DOT_DENSITY_TEXTURE_WIDTH = 1024;

/** Data zoom bounds of the districtr tilesets (tippecanoe -Z3 -z12). */
export const DOT_DENSITY_MIN_DATA_ZOOM = 3;
export const DOT_DENSITY_MAX_DATA_ZOOM = 12;

/** Cap on tiles fetched per cover computation, to bound memory/decode work. */
export const DOT_DENSITY_MAX_COVER_TILES = 64;
