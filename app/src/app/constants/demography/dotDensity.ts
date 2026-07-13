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
export const DOT_DENSITY_PPD_ANCHOR_LEVEL = 23;

/** Phase 1 monochrome dot color (r, g, b, a). */
export const DOT_DENSITY_COLOR: [number, number, number, number] = [0.1, 0.1, 0.35, 0.9];

/** Data zoom bounds of the districtr tilesets (tippecanoe -Z3 -z12). */
export const DOT_DENSITY_MIN_DATA_ZOOM = 3;
export const DOT_DENSITY_MAX_DATA_ZOOM = 12;

/** Cap on tiles fetched per cover computation, to bound memory/decode work. */
export const DOT_DENSITY_MAX_COVER_TILES = 64;
