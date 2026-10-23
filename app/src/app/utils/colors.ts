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
// saturated than PDF viewers render these (ForestGreen is #00e000 here). xcolor's
// base names (red, lime, ...) and svgnames are CSS names, so the browser covers
// them, except where a CamelCase svgname such as ForestGreen is also a
// dvipsname: the exact-case dvipsnames match wins (see resolveColorInput).
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
 * Resolves typed color text to #rrggbb, or null if unrecognized. An exact-case
 * dvipsnames match wins (so `Orange` is LaTeX's, `orange` is CSS's); CSS comes
 * next; then a case-insensitive dvipsnames match (`brickred`).
 */
export function resolveColorInput(input: string): string | null {
  const color = input.trim();
  if (!color) return null;
  return (
    LATEX_DVIPS_COLORS.get(color) ??
    cssColorToHex(color) ??
    LATEX_DVIPS_COLORS_LOWER.get(color.toLowerCase()) ??
    null
  );
}

export const extendColorArray = (
  colorArray: string[],
  numDistricts: number,
  defaultColorArray: string[] = DefaultColorScheme
) => {
  let newColorArray = [...colorArray];
  while (newColorArray.length < numDistricts) {
    const unusedDefaultColors = defaultColorArray.filter(color => !newColorArray.includes(color));
    newColorArray = newColorArray
      .concat(...unusedDefaultColors)
      .concat(...defaultColorArray.map(hexshift))
      .filter((color, index, array) => array.findIndex(c => c === color) === index);
  }
  return newColorArray.slice(0, numDistricts);
};

function hexshift(color: string): string {
  const hex = '0123456789ABCDEF';
  let sub = hex[Math.floor(Math.random() * 16)];
  let char = color[Math.floor(Math.random() * (color.length - 1)) + 1];

  while (sub === char) {
    sub = hex[Math.floor(Math.random() * 16)];
  }

  return color.replace(char, sub);
}

export function districtr(N: number): string[] {
  const colors = [
    '#0099cd',
    '#ffca5d',
    '#00cd99',
    '#99cd00',
    '#cd0099',
    '#9900cd',
    '#8dd3c7',
    '#bebada',
    '#fb8072',
    '#80b1d3',
    '#fdb462',
    '#b3de69',
    '#fccde5',
    '#bc80bd',
    '#ccebc5',
    '#ffed6f',
    '#ffffb3',
    '#a6cee3',
    '#1f78b4',
    '#b2df8a',
    '#33a02c',
    '#fb9a99',
    '#e31a1c',
    '#fdbf6f',
    '#ff7f00',
    '#cab2d6',
    '#6a3d9a',
    '#b15928',
    '#64ffda',
    '#00B8D4',
    '#A1887F',
    '#76FF03',
    '#DCE775',
    '#B388FF',
    '#FF80AB',
    '#D81B60',
    '#26A69A',
    '#FFEA00',
    '#6200EA',
  ];

  const repeats = Math.ceil(N / colors.length);
  const tail = colors.flatMap(color =>
    Array(repeats - 1)
      .fill(null)
      .map(() => hexshift(color))
  );
  return colors.concat(tail).slice(0, N);
}
