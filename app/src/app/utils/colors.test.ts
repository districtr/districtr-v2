import {afterAll, describe, expect, test} from 'bun:test';
import {DISTRICT_PALETTES} from '@/app/constants/colors';
import {extendColorArray, latexBaseAlternative, resolveColorInput} from './colors';

// Minimal stand-in for a canvas 2D context: knows hex plus a few CSS names and,
// like a real canvas, ignores values it can't parse and serializes translucent
// colors as rgba().
const CSS_NAMES: Record<string, string> = {
  orange: '#ffa500',
  rebeccapurple: '#663399',
  lime: '#00ff00',
  red: '#ff0000',
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

  test('resolves dvipsnames exactly and case-insensitively', () => {
    expect(resolveColorInput('ForestGreen')).toBe('#00e000');
    expect(resolveColorInput('  BrickRed ')).toBe('#b80000');
    expect(resolveColorInput('brickred')).toBe('#b80000');
  });

  test('exact-case dvipsnames beat CSS, and CSS beats case-insensitive dvipsnames', () => {
    expect(resolveColorInput('Orange')).toBe('#ff6321');
    expect(resolveColorInput('orange')).toBe('#ffa500');
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

  test('offers the LaTeX value only when a bare base name means something else', () => {
    expect(resolveColorInput('lime')).toBe('#00ff00');
    expect(latexBaseAlternative('lime')).toEqual({input: 'latex:lime', hex: '#bfff00'});
    expect(latexBaseAlternative('red')).toBeNull();
    expect(latexBaseAlternative('rebeccapurple')).toBeNull();
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

  test('is deterministic', () => {
    expect(extendColorArray(okabeIto, 100)).toEqual(extendColorArray(okabeIto, 100));
  });

  test('keeps existing entries in place, duplicates included', () => {
    expect(extendColorArray(['#aaaaaa', '#AAAAAA'], 4).slice(0, 2)).toEqual(['#aaaaaa', '#AAAAAA']);
    expect(extendColorArray(['#0099cd', '#ffca5d', '#00cd99'], 2)).toEqual(['#0099cd', '#ffca5d']);
  });

  test('terminates past the rainbow sequence', () => {
    expect(unique(extendColorArray([], 2000))).toBe(2000);
  });
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
