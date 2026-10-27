import {interpolateRainbow} from 'd3-scale-chromatic';
import {colorScheme as DefaultColorScheme} from '@/app/constants/colors';

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
// svgnames are spelled like CSS names, so the browser resolves them, except
// where a CamelCase svgname such as ForestGreen is also a dvipsname: the
// exact-case dvipsnames match wins (see resolveColorInput).
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

/** Resolves a LaTeX color name: case-sensitive like LaTeX, then case-insensitive. */
function latexColorToHex(name: string): string | null {
  const lower = name.toLowerCase();
  return (
    LATEX_BASE_COLORS.get(name) ??
    LATEX_DVIPS_COLORS.get(name) ??
    LATEX_BASE_COLORS.get(lower) ??
    LATEX_DVIPS_COLORS_LOWER.get(lower) ??
    null
  );
}

/**
 * Resolves typed color text to #rrggbb, or null if unrecognized.
 * - `latex:<name>` looks up only LaTeX names (`latex:lime` is xcolor's #bfff00).
 * - Otherwise an exact-case dvipsnames match wins (so `Orange` is LaTeX's and
 *   `orange` is CSS's), then CSS, then a case-insensitive dvipsnames match
 *   (`brickred`).
 */
export function resolveColorInput(input: string): string | null {
  const color = input.trim();
  if (!color) return null;
  if (color.toLowerCase().startsWith(LATEX_PREFIX)) {
    return latexColorToHex(color.slice(LATEX_PREFIX.length).trim());
  }
  return (
    LATEX_DVIPS_COLORS.get(color) ??
    cssColorToHex(color) ??
    LATEX_DVIPS_COLORS_LOWER.get(color.toLowerCase()) ??
    null
  );
}

/**
 * For a bare name that is both a CSS name and an xcolor base name with a
 * different value (`lime`), the LaTeX alternative, so the UI can offer it.
 */
export function latexBaseAlternative(input: string): {input: string; hex: string} | null {
  const name = input.trim().toLowerCase();
  const hex = LATEX_BASE_COLORS.get(name);
  if (!hex || hex === resolveColorInput(input)) return null;
  return {input: `${LATEX_PREFIX}${name}`, hex};
}

const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

/**
 * Pads `colorArray` to `numDistricts` colors (or truncates it). Existing
 * entries are kept as they are, duplicates included, so no district's color
 * moves. New colors are unused defaults, then steps around d3's cyclic rainbow
 * by the golden ratio. Every added color is distinct (case-insensitively) and
 * the result is the same on every call.
 */
export const extendColorArray = (
  colorArray: string[],
  numDistricts: number,
  defaultColorArray: string[] = DefaultColorScheme
) => {
  const result = colorArray.slice(0, numDistricts);
  const seen = new Set(result.map(color => color.toLowerCase()));
  const add = (color: string) => {
    const key = color.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(key);
  };
  for (const color of defaultColorArray) {
    if (result.length >= numDistricts) break;
    add(color);
  }
  // ponytail: the rainbow has ~1,200 distinct hexes (first repeat at step 384),
  // so past ~1,200 colors this falls back to counting up through hex values.
  // Use a 2D (hue x lightness) sequence if plans ever get that large.
  for (let i = 0; result.length < numDistricts && i < 20_000; i++) {
    const [r, g, b] = parseColorToRgb(interpolateRainbow((i * GOLDEN_RATIO_CONJUGATE) % 1))!;
    add(`#${[r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`);
  }
  for (let n = 0; result.length < numDistricts; n++) {
    add(`#${n.toString(16).padStart(6, '0')}`);
  }
  return result;
};
