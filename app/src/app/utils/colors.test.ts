import {afterAll, describe, expect, test} from 'bun:test';
import {DISTRICT_PALETTES} from '@/app/constants/colors';
import {
  extendColorArray,
  latexBaseAlternative,
  randomColorsInRange,
  resolveColorInput,
} from './colors';

const tone = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return {s: max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1)), l};
};

// Minimal stand-in for a canvas 2D context: knows hex plus a few CSS names and,
// like a real canvas, ignores values it can't parse and serializes translucent
// colors as rgba().
const CSS_NAMES: Record<string, string> = {
  orange: '#ffa500',
  rebeccapurple: '#663399',
  lime: '#00ff00',
  red: '#ff0000',
  green: '#008000',
  forestgreen: '#228b22',
  'rgb(255 0 0 / 50%)': 'rgba(255, 0, 0, 0.5)',
};
let fillStyle = '#000000';
const fakeContext = {
  get fillStyle() {
    return fillStyle;
  },
  set fillStyle(value: string) {
    const lower = value.toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(lower)) fillStyle = lower;
    else if (Object.hasOwn(CSS_NAMES, lower)) fillStyle = CSS_NAMES[lower];
  },
};
(globalThis as any).document = {createElement: () => ({getContext: () => fakeContext})};
// bun runs every test file in one process; don't leak the stub to the others.
afterAll(() => delete (globalThis as any).document);

describe('resolveColorInput', () => {
  test('resolves CSS colors through the canvas', () => {
    expect(resolveColorInput('rebeccapurple')).toBe('#663399');
    expect(resolveColorInput('RebeccaPurple')).toBe('#663399');
  });

  test('resolves dvipsnames CSS lacks, exactly and case-insensitively', () => {
    expect(resolveColorInput('  BrickRed ')).toBe('#b80000');
    expect(resolveColorInput('brickred')).toBe('#b80000');
  });

  test('CSS wins for bare names in any case; latex: reaches the dvipsname', () => {
    expect(resolveColorInput('Orange')).toBe('#ffa500');
    expect(resolveColorInput('orange')).toBe('#ffa500');
    expect(resolveColorInput('Green')).toBe('#008000');
    expect(resolveColorInput('ForestGreen')).toBe('#228b22');
    expect(resolveColorInput('latex:ForestGreen')).toBe('#00e000');
  });

  test('rejects translucent colors', () => {
    expect(resolveColorInput('rgb(255 0 0 / 50%)')).toBeNull();
  });

  test('latex: reaches the xcolor base colors that CSS shadows', () => {
    const xcolorBase: Record<string, string> = {
      green: '#00ff00',
      lime: '#bfff00',
      orange: '#ff8000',
      brown: '#bf8040',
      purple: '#bf0040',
      violet: '#800080',
      pink: '#ffbfbf',
      darkgray: '#404040',
      lightgray: '#bfbfbf',
    };
    for (const [name, hex] of Object.entries(xcolorBase)) {
      expect(resolveColorInput(`latex:${name}`), name).toBe(hex);
    }
    expect(resolveColorInput('LaTeX: Lime')).toBe('#bfff00');
    // Under the prefix, dvipsnames still resolve, case-sensitively first.
    expect(resolveColorInput('latex:Orange')).toBe('#ff6321');
    expect(resolveColorInput('latex:brickred')).toBe('#b80000');
    expect(resolveColorInput('latex:rebeccapurple')).toBeNull();
  });

  test('offers the LaTeX value only when a bare name means something else there', () => {
    expect(resolveColorInput('lime')).toBe('#00ff00');
    expect(latexBaseAlternative('lime')).toEqual({input: 'latex:lime', hex: '#bfff00'});
    expect(latexBaseAlternative('Green')).toEqual({input: 'latex:Green', hex: '#00ff00'});
    expect(latexBaseAlternative('Orange')).toEqual({input: 'latex:Orange', hex: '#ff6321'});
    expect(latexBaseAlternative('red')).toBeNull();
    expect(latexBaseAlternative('BrickRed')).toBeNull();
    expect(latexBaseAlternative('rebeccapurple')).toBeNull();
    expect(latexBaseAlternative('latex:lime')).toBeNull();
  });

  test('rejects empty and unknown input, including Object prototype keys', () => {
    expect(resolveColorInput('')).toBeNull();
    expect(resolveColorInput('notacolor')).toBeNull();
    expect(resolveColorInput('constructor')).toBeNull();
  });
});

describe('extendColorArray', () => {
  const okabeIto = [...DISTRICT_PALETTES.find(p => p.name === 'Okabe-Ito')!.colors];
  const unique = (colors: string[]) => new Set(colors.map(c => c.toLowerCase())).size;

  test('short palettes extend without repeating colors, even past the defaults', () => {
    for (const count of [20, 100, 400]) {
      const scheme = extendColorArray(okabeIto, count);
      expect(scheme).toHaveLength(count);
      expect(scheme.slice(0, okabeIto.length)).toEqual(okabeIto);
      expect(unique(scheme)).toBe(count);
    }
  });

  test('a default-colored plan grows into the next default colors', () => {
    const defaults = [...DISTRICT_PALETTES[0].colors];
    expect(extendColorArray(defaults.slice(0, 4), 8)).toEqual(defaults.slice(0, 8));
    // An applied palette grows from its own unused colors, even where the
    // default shares them.
    const set3 = [...DISTRICT_PALETTES.find(p => p.name === 'ColorBrewer Set3')!.colors];
    expect(extendColorArray(set3.slice(0, 6), 11)).toEqual(set3);
  });

  test('is deterministic', () => {
    expect(extendColorArray(okabeIto, 100)).toEqual(extendColorArray(okabeIto, 100));
  });

  test('keeps existing entries in place, duplicates included', () => {
    expect(extendColorArray(['#aaaaaa', '#AAAAAA'], 4).slice(0, 2)).toEqual(['#aaaaaa', '#AAAAAA']);
    expect(extendColorArray(['#0099cd', '#ffca5d', '#00cd99'], 2)).toEqual(['#0099cd', '#ffca5d']);
  });

  test('new colors loosely match the palette and bring in new hues', () => {
    for (const name of ['ColorBrewer Pastel1', 'ColorBrewer Dark2', 'Tableau 10']) {
      const palette = [...DISTRICT_PALETTES.find(p => p.name === name)!.colors];
      const avg = (key: 's' | 'l') =>
        palette.reduce((sum, c) => sum + tone(c)[key], 0) / palette.length;
      const added = extendColorArray(palette, palette.length + 4).slice(palette.length);
      for (const color of added) {
        expect(Math.abs(tone(color).l - avg('l')), `${name} ${color}`).toBeLessThan(0.1);
        expect(Math.abs(tone(color).s - avg('s')), `${name} ${color}`).toBeLessThan(0.15);
      }
      expect(unique([...palette, ...added])).toBe(palette.length + 4);
    }
  });

  test('terminates past the hue sequence', () => {
    expect(unique(extendColorArray([], 2000))).toBe(2000);
  });
});

test('random suggestions stay in the tone range of the current colors', () => {
  const pastel = [...DISTRICT_PALETTES.find(p => p.name === 'ColorBrewer Pastel1')!.colors];
  const tones = pastel.map(tone);
  const lMin = Math.min(...tones.map(t => t.l));
  const lMax = Math.max(...tones.map(t => t.l));
  const suggestions = randomColorsInRange(pastel, 24);
  expect(suggestions).toHaveLength(24);
  expect(new Set([...pastel, ...suggestions]).size).toBe(pastel.length + 24);
  for (const color of suggestions) {
    // Small slack for rounding to 8-bit channels.
    expect(tone(color).l, color).toBeGreaterThanOrEqual(lMin - 0.02);
    expect(tone(color).l, color).toBeLessThanOrEqual(lMax + 0.02);
  }
});

test('ColorBrewer palettes contain no grays', () => {
  for (const {name, colors} of DISTRICT_PALETTES.filter(p => p.name.startsWith('ColorBrewer'))) {
    expect(
      colors.filter(c => /^#([0-9a-f]{2})\1\1$/i.test(c)),
      name
    ).toEqual([]);
  }
  // Set1 keeps its 8 hues after losing #999999.
  expect(DISTRICT_PALETTES.find(p => p.name === 'ColorBrewer Set1')!.colors).toHaveLength(8);
});
