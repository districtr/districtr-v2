import {DISTRICT_PALETTES} from '@/app/constants/colors';
import {CSS_NAMED_COLORS} from '@/app/constants/cssColors';
import {LATEX_EXTENDED_COLORS} from '@/app/constants/latexColors';

/**
 * Picks readable text color for a given background: 'white' if the background
 * (blended toward white by 1 - alpha, since alpha'd cells sit on a white/
 * near-white page background) is dark enough that default dark text would be
 * hard to read, otherwise undefined (inherit the default dark text).
 *
 * `color` is the un-alpha'd base color (hex or `rgb(...)`) and `alpha` is
 * supplied separately, rather than one pre-composed CSS string, so callers
 * using CSS color-mix()/similar (not machine-parseable the way rgb()/hex are)
 * can still pass their known base color + alpha directly.
 */
export function getReadableTextColor(color: string, alpha: number = 1): 'white' | undefined {
  const rgb = parseColorToRgb(color);
  if (!rgb) return undefined;
  const [r, g, b] = rgb;
  const blend = (channel: number) => channel * alpha + 255 * (1 - alpha);
  const luminance = (0.299 * blend(r) + 0.587 * blend(g) + 0.114 * blend(b)) / 255;
  return luminance < 0.55 ? 'white' : undefined;
}

function parseColorToRgb(color: string): [number, number, number] | null {
  const rgbMatch = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return [Number(r), Number(g), Number(b)];
  }
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

// LaTeX xcolor `dvipsnames` (the 68 CMYK colors in dvipsnam.def), converted
// to RGB with xcolor's own rule, rgb = 1 - min(1, cmy + k). That rule runs more
// saturated than PDF viewers render these (ForestGreen is #00e000 here).
// svgnames are spelled like CSS names, so the browser resolves them. Where a
// dvipsname is also a CSS name (Orange, ForestGreen, Violet), CSS wins and
// `latex:` reaches the dvipsname (see resolveColorInput).
const LATEX_DVIPS_COLORS = new Map<string, string>(
  Object.entries({
    GreenYellow: '#d9ff4f',
    Yellow: '#ffff00',
    Goldenrod: '#ffe629',
    Dandelion: '#ffb529',
    Apricot: '#ffad7a',
    Peach: '#ff804d',
    Melon: '#ff8a80',
    YellowOrange: '#ff9400',
    Orange: '#ff6321',
    BurntOrange: '#ff7d00',
    Bittersweet: '#c20300',
    RedOrange: '#ff3b21',
    Mahogany: '#a60000',
    Maroon: '#ad0000',
    BrickRed: '#b80000',
    Red: '#ff0000',
    OrangeRed: '#ff0080',
    RubineRed: '#ff00de',
    WildStrawberry: '#ff0a9c',
    Salmon: '#ff789e',
    CarnationPink: '#ff5eff',
    Magenta: '#ff00ff',
    VioletRed: '#ff30ff',
    Rhodamine: '#ff2eff',
    Mulberry: '#a314fa',
    RedViolet: '#9600a8',
    Fuchsia: '#7303eb',
    Lavender: '#ff85ff',
    Thistle: '#e069ff',
    Orchid: '#ad5cff',
    DarkOrchid: '#9933cc',
    Purple: '#8c24ff',
    Plum: '#8000ff',
    Violet: '#361fff',
    RoyalPurple: '#4019ff',
    BlueViolet: '#190df5',
    Periwinkle: '#6e73ff',
    CadetBlue: '#616ec4',
    CornflowerBlue: '#59deff',
    MidnightBlue: '#007091',
    NavyBlue: '#0f75ff',
    RoyalBlue: '#0080ff',
    Blue: '#0000ff',
    Cerulean: '#0fe3ff',
    Cyan: '#00ffff',
    ProcessBlue: '#0affff',
    SkyBlue: '#61ffe0',
    Turquoise: '#26ffcc',
    TealBlue: '#1ffaa3',
    Aquamarine: '#2effb2',
    BlueGreen: '#26ffab',
    Emerald: '#00ff80',
    JungleGreen: '#03ff7a',
    SeaGreen: '#4fff80',
    Green: '#00ff00',
    ForestGreen: '#00e000',
    PineGreen: '#00bf29',
    LimeGreen: '#80ff00',
    YellowGreen: '#8fff42',
    SpringGreen: '#bdff3d',
    OliveGreen: '#009900',
    RawSienna: '#8c0000',
    Sepia: '#4d0000',
    Brown: '#660000',
    Tan: '#db9470',
    Gray: '#808080',
    Black: '#000000',
    White: '#ffffff',
  })
);
const LATEX_DVIPS_COLORS_LOWER = new Map(
  [...LATEX_DVIPS_COLORS].map(([name, hex]) => [name.toLowerCase(), hex])
);

// xcolor's 19 base colors, from the rgb column of xcolor.dtx. They share
// lowercase spellings with CSS, and nine of them (green, lime, orange, brown,
// purple, violet, pink, darkgray, lightgray) have different values there, so
// a bare `lime` stays CSS's and `latex:lime` reaches xcolor's.
const LATEX_BASE_COLORS = new Map<string, string>(
  Object.entries({
    red: '#ff0000',
    green: '#00ff00',
    blue: '#0000ff',
    cyan: '#00ffff',
    magenta: '#ff00ff',
    yellow: '#ffff00',
    black: '#000000',
    white: '#ffffff',
    gray: '#808080',
    darkgray: '#404040',
    lightgray: '#bfbfbf',
    brown: '#bf8040',
    lime: '#bfff00',
    olive: '#808000',
    orange: '#ff8000',
    pink: '#ffbfbf',
    purple: '#bf0040',
    teal: '#008080',
    violet: '#800080',
  })
);
// Names compare loosely everywhere (typing and search): accents, case,
// spaces and punctuation dropped, so `Tenné (Tawny)` is `tennetawny`.
const latexKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
// CSS names are all one lowercase word, so they are their own keys.
const CSS_BY_KEY = new Map(Object.entries(CSS_NAMED_COLORS));
const LATEX_EXTENDED_BY_KEY = new Map(
  Object.entries(LATEX_EXTENDED_COLORS).map(([name, hex]) => [latexKey(name), hex])
);
const LATEX_PREFIX = 'latex:';

let colorContext: CanvasRenderingContext2D | null | undefined;

/** Resolves any CSS color (name, hex, rgb(), hsl(), ...) to opaque #rrggbb via the browser. */
function cssColorToHex(color: string): string | null {
  if (typeof document === 'undefined') return null;
  colorContext ??= document.createElement('canvas').getContext('2d');
  if (!colorContext) return null;
  // Canvas ignores invalid values, so only a real color gives the same result
  // after two different starting values.
  colorContext.fillStyle = '#000000';
  colorContext.fillStyle = color;
  const fromBlack = colorContext.fillStyle;
  colorContext.fillStyle = '#ffffff';
  colorContext.fillStyle = color;
  // Translucent colors serialize as rgba(); district fills need opaque hex.
  return fromBlack === colorContext.fillStyle && /^#[0-9a-f]{6}$/.test(fromBlack)
    ? fromBlack
    : null;
}

/**
 * Resolves a LaTeX color name: xcolor's base and dvipsnames case-sensitively
 * like LaTeX, then case-insensitively, then ignoring case, spaces and
 * punctuation: latexcolor.com's names (`Burnt orange`, `byzantium`) before
 * xcolor's (`Forest Green`).
 */
function latexColorToHex(name: string): string | null {
  const key = latexKey(name);
  return (
    LATEX_BASE_COLORS.get(name) ??
    LATEX_DVIPS_COLORS.get(name) ??
    LATEX_BASE_COLORS.get(name.toLowerCase()) ??
    LATEX_DVIPS_COLORS_LOWER.get(name.toLowerCase()) ??
    LATEX_EXTENDED_BY_KEY.get(key) ??
    LATEX_BASE_COLORS.get(key) ??
    LATEX_DVIPS_COLORS_LOWER.get(key) ??
    null
  );
}

/**
 * Resolves typed color text to #rrggbb, or null if unrecognized.
 * - `latex:<name>` looks up only LaTeX names (`latex:lime` is xcolor's #bfff00).
 * - Otherwise CSS wins, so `Green` is CSS's #008000 however a phone
 *   capitalizes it, and a LaTeX name applies only when CSS doesn't know it
 *   (`BrickRed`, `brickred`).
 * - Names match however they're spaced or capitalized: `Forest green` is
 *   CSS's forestgreen, `olive green` is LaTeX's OliveGreen.
 */
export function resolveColorInput(input: string): string | null {
  const color = input.trim();
  if (!color) return null;
  if (color.toLowerCase().startsWith(LATEX_PREFIX)) {
    return latexColorToHex(color.slice(LATEX_PREFIX.length).trim());
  }
  return (
    CSS_BY_KEY.get(color.toLowerCase()) ??
    cssColorToHex(color) ??
    CSS_BY_KEY.get(latexKey(color)) ??
    latexColorToHex(color)
  );
}

/**
 * For a bare name that CSS and LaTeX both know with different values (`lime`,
 * `Orange`), the LaTeX alternative, so the UI can offer it.
 */
export function latexBaseAlternative(input: string): {input: string; hex: string} | null {
  const name = input.trim();
  if (name.toLowerCase().startsWith(LATEX_PREFIX)) return null;
  const hex = latexColorToHex(name);
  if (!hex || hex === resolveColorInput(name)) return null;
  return {input: `${LATEX_PREFIX}${name}`, hex};
}

export type ColorName = {
  name: string;
  source: 'CSS' | 'LaTeX';
  hex: string;
  /** What picking it types: the name, or `latex:<name>` when CSS owns the bare name. */
  input: string;
  key: string;
  words: string[];
};

let colorNames: ColorName[] | undefined;

/**
 * Every color name the field accepts, CSS first, then xcolor's base and
 * dvipsnames, then latexcolor.com's, each with the text that resolves to it.
 * Built from resolveColorInput itself, so a suggestion's swatch is always what
 * picking it gives. Names no input reaches (latexcolor.com's `Apricot`, which
 * dvipsnames' Apricot shadows) and same-color repeats are left out.
 */
export function colorNameIndex(): ColorName[] {
  if (colorNames) return colorNames;
  const seen = new Set<string>();
  const out: ColorName[] = [];
  const add = (source: ColorName['source'], entries: Iterable<[string, string]>) => {
    for (const [name, hex] of entries) {
      const input = resolveColorInput(name) === hex ? name : `${LATEX_PREFIX}${name}`;
      const key = latexKey(name);
      if (resolveColorInput(input) !== hex || seen.has(`${key}${hex}`)) continue;
      seen.add(`${key}${hex}`);
      const words = name
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u);
      out.push({name, source, hex, input, key, words});
    }
  };
  add('CSS', CSS_BY_KEY);
  add('LaTeX', LATEX_BASE_COLORS);
  add('LaTeX', LATEX_DVIPS_COLORS);
  add('LaTeX', Object.entries(LATEX_EXTENDED_COLORS));
  return (colorNames = out);
}

/**
 * Color names matching typed text, compared the way the field resolves it:
 * the whole name, then names starting with it, then a word starting with it
 * (`blue` finds `Air Force blue`), then anywhere in the name. Ties keep index
 * order (CSS first), then shorter names first. `latex:` limits results to
 * LaTeX names; hex and functional colors (`rgb(`) get none.
 */
export function searchColorNames(text: string, limit = 8): ColorName[] {
  let query = text.trim();
  const latexOnly = query.toLowerCase().startsWith(LATEX_PREFIX);
  if (latexOnly) query = query.slice(LATEX_PREFIX.length);
  const key = latexKey(query);
  if (!key || query.startsWith('#') || query.includes('(')) return [];
  const rank = (entry: ColorName) =>
    entry.key === key
      ? 0
      : entry.key.startsWith(key)
        ? 1
        : entry.words.some(word => word.startsWith(key))
          ? 2
          : entry.key.includes(key)
            ? 3
            : -1;
  return colorNameIndex()
    .map((entry, order) => ({entry, order, rank: rank(entry)}))
    .filter(match => match.rank >= 0 && (!latexOnly || match.entry.source === 'LaTeX'))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(a.entry.source === 'LaTeX') - Number(b.entry.source === 'LaTeX') ||
        a.entry.name.length - b.entry.name.length ||
        a.order - b.order
    )
    .slice(0, limit)
    .map(match => match.entry);
}

/**
 * The palette sharing the most colors with `colors` (case-insensitively), or
 * undefined when none shares any. A tie goes to the shorter palette: the
 * Districtr default holds all of ColorBrewer Set3 and all but one of Paired,
 * so those would otherwise always read as the default. With `minShare`, a
 * palette counts only if it covers that share of min(colors, its length).
 */
export function matchingPalette(
  colors: readonly string[],
  minShare = 0
): (typeof DISTRICT_PALETTES)[number] | undefined {
  const used = new Set(colors.map(color => color.toLowerCase()));
  let best: (typeof DISTRICT_PALETTES)[number] | undefined;
  let bestHits = 0;
  for (const palette of DISTRICT_PALETTES) {
    const hits = palette.colors.filter(color => used.has(color.toLowerCase())).length;
    if (!hits || hits < minShare * Math.min(colors.length, palette.colors.length)) continue;
    if (hits > bestHits || (hits === bestHits && palette.colors.length < best!.colors.length)) {
      [best, bestHits] = [palette, hits];
    }
  }
  return best;
}

/** The unassigned land fill (GeometryBackgroundLayer). */
export const UNASSIGNED_FILL = '#cecece';

function hexToLab(color: string): [number, number, number] | null {
  const rgb = parseColorToRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return [
    116 * fy - 16,
    500 * (f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047) - fy),
    200 * (fy - f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)),
  ];
}

/** CIELAB ΔE*ab between two colors; about 2 is just noticeable. */
export function colorDistance(a: string, b: string): number {
  const [x, y] = [hexToLab(a), hexToLab(b)];
  return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : Infinity;
}

/**
 * Whether a color has CIELAB chroma under 10 (a just-noticeable difference is
 * about 2). Generated suggestions skip these so they bring real hues; a user's
 * own pick is only questioned near the unassigned fill (looksUnassigned).
 */
export function isNearGray(color: string): boolean {
  const lab = hexToLab(color);
  return !!lab && Math.hypot(lab[1], lab[2]) < 10;
}

/**
 * Whether a district in this color could pass for unassigned land: within
 * ΔE*ab 10 of the #cecece fill. Grays well lighter or darker (#b0b0b0, white,
 * black) and the palest palette tints (Pastel2's #cbd5e8, 10.7) stay clear.
 */
export const looksUnassigned = (color: string) => colorDistance(color, UNASSIGNED_FILL) < 10;

/**
 * Below this ΔE*ab two district colors are hard to tell apart on the map. The
 * closest pair any palette ships is the default's #fdb462/#fdbf6f at 6.3.
 */
export const NEAR_DUPLICATE_DISTANCE = 5;

const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

function hexToHsl(color: string): [number, number, number] | null {
  const rgb = parseColorToRgb(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * `count` new colors in the tone range of `colors`: saturation and lightness
 * are drawn at random from the span the chromatic colors cover, and hues
 * spread around the wheel from a random start with some jitter. Sorted by
 * hue, and none repeats a color in `colors`.
 */
export function randomColorsInRange(
  colors: string[],
  count: number,
  random: () => number = Math.random
): string[] {
  const chromatic = colors
    .map(hexToHsl)
    .filter((hsl): hsl is [number, number, number] => !!hsl && hsl[1] > 0.15);
  const span = (i: number, fallback: [number, number]): [number, number] => {
    if (!chromatic.length) return fallback;
    const values = chromatic.map(hsl => hsl[i]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    // A one-color range still gets a little room to vary.
    if (hi - lo >= 0.1) return [lo, hi];
    const mid = (lo + hi) / 2;
    return [mid - 0.05, mid + 0.05];
  };
  const [sLo, sHi] = span(1, [0.5, 0.8]);
  const [lLo, lHi] = span(2, [0.4, 0.6]);
  const seen = new Set(colors.map(color => color.toLowerCase()));
  const start = random() * 360;
  const out: [number, string][] = [];
  for (let i = 0; out.length < count && i < count * 20; i++) {
    const hue = (start + i * GOLDEN_RATIO_CONJUGATE * 360 + (random() - 0.5) * 20 + 360) % 360;
    const hex = hslToHex(
      hue,
      clamp(sLo + random() * (sHi - sLo), 0, 1),
      clamp(lLo + random() * (lHi - lLo), 0.05, 0.95)
    );
    if (seen.has(hex) || isNearGray(hex)) continue;
    seen.add(hex);
    out.push([hue, hex]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, hex]) => hex);
}

/**
 * Pads `colorArray` to `numDistricts` colors (or truncates it). Existing
 * entries are kept as they are, duplicates included, so no district's color
 * moves. The unused colors of the palette `colorArray` mostly comes from (the
 * Districtr default when none matches) come first, in palette order, so a
 * default-colored plan grows into the next default colors. Past those, new
 * colors take the scheme's average saturation and lightness and step around
 * the hue wheel by the golden ratio, skipping hues too close to one already
 * in use (the allowed gap halves each lap). Later laps also nudge lightness.
 * Every added color is distinct (case-insensitively) and the result is the
 * same on every call.
 */
export const extendColorArray = (colorArray: string[], numDistricts: number) => {
  const result = colorArray.slice(0, numDistricts);
  const seen = new Set(result.map(color => color.toLowerCase()));
  for (const color of (matchingPalette(result) ?? DISTRICT_PALETTES[0]).colors) {
    if (result.length >= numDistricts) break;
    if (seen.has(color.toLowerCase())) continue;
    seen.add(color.toLowerCase());
    result.push(color);
  }
  // Grays have no meaningful hue, so they don't set the style or block hues.
  const chromatic = result
    .map(hexToHsl)
    .filter((hsl): hsl is [number, number, number] => !!hsl && hsl[1] > 0.15);
  const mean = (i: number, fallback: number) =>
    chromatic.length
      ? chromatic.reduce((sum, hsl) => sum + hsl[i], 0) / chromatic.length
      : fallback;
  const saturation = clamp(mean(1, 0.65), 0.3, 1);
  const lightness = clamp(mean(2, 0.5), 0.25, 0.85);
  const hues = chromatic.map(hsl => hsl[0]);
  const lightnessShifts = [0, -0.08, 0.08, -0.16, 0.16];
  // ponytail: ~360 hue steps per lap at a few lightness levels; past ~2,000
  // colors this falls back to counting up through hex values.
  for (let i = 0; result.length < numDistricts && i < 20_000; i++) {
    const lap = Math.floor(i / 360);
    const minGap = 24 / 2 ** lap;
    const hue = (i * GOLDEN_RATIO_CONJUGATE * 360) % 360;
    if (hues.some(used => hueDistance(used, hue) < minGap)) continue;
    const hex = hslToHex(hue, saturation, clamp(lightness + lightnessShifts[lap % 5], 0.15, 0.9));
    if (seen.has(hex) || isNearGray(hex)) continue;
    seen.add(hex);
    hues.push(hue);
    result.push(hex);
  }
  for (let n = 0; result.length < numDistricts; n++) {
    const hex = `#${n.toString(16).padStart(6, '0')}`;
    if (!seen.has(hex)) {
      seen.add(hex);
      result.push(hex);
    }
  }
  return result;
};
