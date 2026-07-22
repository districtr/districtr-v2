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
