'use client';

export type Rgb = { r: number; g: number; b: number };
export type MixEntry = { rgb: Rgb; alpha: number };

export type CommunityMixTuning = {
  maxAlpha: number;
  slowPower: number;
  darkenStep: number;
  darkenCap: number;
};

export const DEFAULT_COMMUNITY_MIX_TUNING: CommunityMixTuning = {
  maxAlpha: 0.8,
  slowPower: 1.4,
  darkenStep: 0.1,
  darkenCap: 0.8,
};

/**
 * Parse a hex color (#rgb or #rrggbb) into RGB.
 * Returns null for invalid input.
 *
 * Supports both 3-digit and 6-digit hex formats. For 3-digit, each digit is repeated to form the
 * full value (e.g., #f0a becomes #ff00aa).
 *
 * @param hex - The hex color string to parse.
 * @returns An object with r, g, b values or null if the input is invalid.
 */
export const parseHexColor = (hex: string): Rgb | null => {
  const raw = hex.trim().replace('#', '');
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null;
  }
  if (raw.length === 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null;
  }
  return null;
};

/**
 * Composites a stack of RGBA colors using Porter–Duff "source-over" (Normal) alpha blending,
 * then optionally remaps/clamps the resulting alpha and applies an optional post-darkening.
 *
 * This function is used in the mixing of the colors for the community layers. Rather than
 * building up what could be dozens of rendering layers in the DOM, we compute the predicted
 * final color on the client and render a single layer with that color. This allows us to
 * support a large number of layers without performance degradation, and also gives us the
 * flexibility to apply custom remapping and darkening effects that would be difficult to achieve
 * with pure CSS (for example it can allow for better delineation between 2,3,4+ overlaps by
 * applying a non-linear remapping to the alpha and/or a custom darkening curve).
 *
 * An explanation of the basic compositing math can be found at
 *
 * https://www.w3.org/TR/compositing-1/#porterduffcompositingoperators_srcover
 *
 *
 * Blending model (performed in premultiplied-alpha form):
 * - For each layer (src) composited over the running result (dst):
 *     outRGB_premul = srcRGB * a + dstRGB_premul * (1 - a)
 *     outA          = a        + dstA          * (1 - a)
 * - After all layers:
 *     rgb = outRGB_premul / outA   (unpremultiply to get straight RGB)
 *
 * Notes / nonstandard behavior:
 * - `maxAlpha` and `slowPower` modify the final output alpha only:
 *     finalA = min(outA ** slowPower, maxAlpha)
 *   while the RGB is computed from the *true* stacked composite (based on outA), not finalA.
 * - `darkenStep`, `darkenCap`, and `overlapCount` apply a simple linear dimming to RGB:
 *     darken = clamp((overlapCount - 1) * darkenStep, 0, darkenCap)
 *     rgb *= (1 - darken)
 *   This is not the Porter–Duff "darken" blend mode; it is a constant brightness scale.
 *
 * Input expectations:
 * - `alpha` values are treated as opacities in [0, 1] and are clamped to that range.
 * - `rgb` channel values are assumed to be in the same numeric space you want to output
 *   (commonly 0–255). The function rounds RGB channels to integers in the returned string.
 *
 * Ordering:
 * - Colors are composited in array order: earlier entries are drawn first, later entries
 *   are drawn on top of the accumulated result.
 *
 * @param colors
 *   Stack of colors to composite, each with:
 *   - `rgb`: { r, g, b } (typically 0–255)
 *   - `alpha`: opacity in [0, 1] (clamped)
 *
 * @param options
 *   Optional post-processing controls:
 *   - `maxAlpha` (default: 1):
 *       Upper bound for the returned alpha channel.
 *   - `slowPower` (default: 1, minimum: 1):
 *       Exponent applied to the accumulated alpha before clamping. Values > 1 reduce
 *       alpha growth for intermediate values (e.g., 0.5^2 = 0.25).
 *   - `overlapCount` (default: colors.length, minimum: 1):
 *       Number of effective overlaps used to compute darkening (can be decoupled from
 *       the number of provided colors).
 *   - `darkenStep` (default: 0, minimum: 0):
 *       Per-additional-overlap dimming factor applied to RGB.
 *   - `darkenCap` (default: 1, clamped to [0, 1]):
 *       Maximum total dimming factor (e.g., cap at 0.4 means at most 40% dimmer).
 *
 * @returns
 *   An `rgba(r, g, b, a)` CSS color string, or `null` if the stack results in zero alpha
 *   (i.e., all layers are fully transparent or the input array is empty).
 */
export const mixRgbaColors = (
  colors: Array<MixEntry>,
  options: {
    maxAlpha?: number;
    slowPower?: number;
    darkenStep?: number;
    darkenCap?: number;
    overlapCount?: number;
  } = {}
): string | null => {
  if (!colors.length) return null;
  let outA = 0;
  let outR = 0;
  let outG = 0;
  let outB = 0;

  for (const { rgb, alpha } of colors) {
    const a = Math.max(0, Math.min(1, alpha));
    if (a === 0) continue;
    outR = rgb.r * a + outR * (1 - a);
    outG = rgb.g * a + outG * (1 - a);
    outB = rgb.b * a + outB * (1 - a);
    outA = a + outA * (1 - a);
  }

  // Return null for fully transparent result (also guards against division by zero in
  // unpremultiply step).
  if (outA <= 0) return null;

  const clampedMax = Math.max(0, Math.min(1, options.maxAlpha ?? 1));
  const slowPower = Math.max(1, options.slowPower ?? 1);
  const slowedA = Math.pow(outA, slowPower);
  const finalA = Math.min(slowedA, clampedMax);

  // Preserve the stacked RGB look, but clamp overall alpha.
  let rr = outR / outA;
  let gg = outG / outA;
  let bb = outB / outA;
  const overlapCount = Math.max(1, options.overlapCount ?? colors.length);
  const darkenStep = Math.max(0, options.darkenStep ?? 0);
  const darkenCap = Math.max(0, Math.min(1, options.darkenCap ?? 1));
  const darken = Math.min(darkenCap, Math.max(0, (overlapCount - 1) * darkenStep));

  if (darken > 0) {
    rr = rr * (1 - darken);
    gg = gg * (1 - darken);
    bb = bb * (1 - darken);
  }

  return `rgba(${Math.round(rr)}, ${Math.round(gg)}, ${Math.round(bb)}, ${finalA.toFixed(4)})`;
};
