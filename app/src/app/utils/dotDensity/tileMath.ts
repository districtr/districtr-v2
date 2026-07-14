/**
 * Tile math for the dot density custom layer: slippy tile cover from map
 * bounds, float64 matrix composition (so float32 never sees full mercator
 * coordinates), and the stipple grid LOD policy.
 */
import {
  DOT_DENSITY_CELL_PX,
  DOT_DENSITY_MAX_COVER_TILES,
  DOT_DENSITY_MAX_DATA_ZOOM,
  DOT_DENSITY_MIN_DATA_ZOOM,
  DOT_DENSITY_PPD_ANCHOR_LEVEL,
} from '@constants/demography/dotDensity';

export type TileID = {z: number; x: number; y: number};

export const tileKey = ({z, x, y}: TileID) => `${z}/${x}/${y}`;

/** Longitude → mercator x in [0,1]. */
export const lngToMercX = (lng: number) => (lng + 180) / 360;

/** Latitude → mercator y in [0,1] (y grows southward, per slippy convention). */
export const latToMercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - (0.25 * Math.log((1 + s) / (1 - s))) / Math.PI;
  return Math.min(1, Math.max(0, y));
};

export const dataZoomForMapZoom = (zoom: number) =>
  Math.min(DOT_DENSITY_MAX_DATA_ZOOM, Math.max(DOT_DENSITY_MIN_DATA_ZOOM, Math.floor(zoom)));

/** Tiles at zoom z covering the given lng/lat bounds, capped in count. */
export const coverForBounds = (
  bounds: {west: number; south: number; east: number; north: number},
  z: number
): TileID[] => {
  const dim = 2 ** z;
  const clamp = (v: number) => Math.min(dim - 1, Math.max(0, v));
  const minX = clamp(Math.floor(lngToMercX(bounds.west) * dim));
  const maxX = clamp(Math.floor(lngToMercX(bounds.east) * dim));
  const minY = clamp(Math.floor(latToMercY(bounds.north) * dim));
  const maxY = clamp(Math.floor(latToMercY(bounds.south) * dim));
  const tiles: TileID[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({z, x, y});
      if (tiles.length >= DOT_DENSITY_MAX_COVER_TILES) return tiles;
    }
  }
  return tiles;
};

/**
 * Compose (in float64) the tile-local→clip matrix:
 * mapMatrix × translate(x/2^z, y/2^z) × scale(1/2^z).
 * mapMatrix is the column-major mercator→clip matrix maplibre hands to
 * CustomLayerInterface.render. Composing before the float32 cast is what
 * keeps high zooms jitter-free.
 */
export const composeTileMatrix = (
  mapMatrix: ArrayLike<number>,
  {z, x, y}: TileID
): Float32Array => {
  const s = 1 / 2 ** z;
  const tx = x * s;
  const ty = y * s;
  const m = mapMatrix;
  const out = new Float32Array(16);
  // out.col0 = m.col0 * s; out.col1 = m.col1 * s; out.col2 = m.col2
  // out.col3 = m.col0*tx + m.col1*ty + m.col3
  for (let r = 0; r < 4; r++) {
    out[r] = m[r] * s;
    out[4 + r] = m[4 + r] * s;
    out[8 + r] = m[8 + r];
    out[12 + r] = m[r] * tx + m[4 + r] * ty + m[12 + r];
  }
  return out;
};

/** Stipple grid level for a display zoom: cells ≈ DOT_DENSITY_CELL_PX on screen. */
export const gridLevelForZoom = (zoom: number) =>
  Math.min(24, Math.max(6, Math.round(zoom + Math.log2(512 / DOT_DENSITY_CELL_PX))));

/**
 * People represented by one dot at grid level n. Halves per finer level
 * (rather than quartering with cell area), so cities read as saturated at
 * low zoom and resolve into individual dots as you zoom in — the classic
 * dot map behavior. 2^(20-n) ≈ 512 people/dot at state view, 1 at z14+.
 */
export const peoplePerDotForLevel = (n: number) =>
  Math.min(65536, Math.max(1, 2 ** (DOT_DENSITY_PPD_ANCHOR_LEVEL - n)));
