import {afterAll, describe, expect, test} from 'bun:test';
import {DISTRICT_PALETTES} from '@/app/constants/colors';
import {CSS_NAMED_COLORS} from '@/app/constants/cssColors';
import {LATEX_EXTENDED_COLORS} from '@/app/constants/latexColors';
import {
  colorDistance,
  extendColorArray,
  isNearGray,
  latexBaseAlternative,
  looksUnassigned,
  matchingPalette,
  NEAR_DUPLICATE_DISTANCE,
  randomColorsInRange,
  resolveColorInput,
  colorNameIndex,
  searchColorNames,
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

  test("resolves latexcolor.com's names, ignoring case, spaces and punctuation", () => {
    expect(Object.keys(LATEX_EXTENDED_COLORS)).toHaveLength(758);
    expect(resolveColorInput('Byzantium')).toBe('#702963');
    expect(resolveColorInput('latex:byzantium')).toBe('#702963');
    expect(resolveColorInput('Amaranth')).toBe('#e52b50');
    expect(resolveColorInput('Burnt orange')).toBe('#cc5500');
    expect(resolveColorInput("davy's grey")).toBe('#555555');
    expect(resolveColorInput('Tenné (Tawny)')).toBe('#cd5700');
    // xcolor's own spellings keep xcolor's values.
    expect(resolveColorInput('BurntOrange')).toBe('#ff7d00');
    expect(resolveColorInput('latex:lime')).toBe('#bfff00');
    for (const [name, hex] of Object.entries(LATEX_EXTENDED_COLORS)) {
      expect(resolveColorInput(`latex:${name}`), name).toMatch(/^#[0-9a-f]{6}$/);
      // A name CSS knows squashed (`Medium aquamarine`) takes CSS's value.
      const css = CSS_NAMED_COLORS[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
      if (!/^[a-z]+$/i.test(name)) expect(resolveColorInput(name), name).toBe(css ?? hex);
    }
  });

  test('matches names however they are spaced or capitalized', () => {
    expect(resolveColorInput('Air Force blue')).toBe('#5d8aa8');
    expect(resolveColorInput('airforceblue')).toBe('#5d8aa8');
    expect(resolveColorInput('AIR-FORCE BLUE')).toBe('#5d8aa8');
    // CSS names: canvas only knows them squashed.
    expect(resolveColorInput('Forest green')).toBe('#228b22');
    expect(resolveColorInput('Rebecca Purple')).toBe('#663399');
    // xcolor names, with or without the prefix.
    expect(resolveColorInput('olive green')).toBe('#009900');
    // latexcolor.com's own spelling keeps its value over xcolor's BurntOrange.
    expect(resolveColorInput('Burnt orange')).toBe('#cc5500');
    expect(resolveColorInput('latex:Forest Green')).toBe('#00e000');
    expect(resolveColorInput('latex:Teal')).toBe('#008080');
    expect(resolveColorInput('latex:teal')).toBe('#008080');
  });

  test('ignores accents', () => {
    expect(resolveColorInput('tenne tawny')).toBe('#cd5700');
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

describe('matchingPalette', () => {
  const palette = (name: string) => DISTRICT_PALETTES.find(p => p.name === name)!;

  test('names the applied palette, not the default that contains its colors', () => {
    for (const name of ['ColorBrewer Set3', 'ColorBrewer Paired']) {
      const scheme = extendColorArray([...palette(name).colors], 40);
      for (const count of [4, 8, 11, 20]) {
        expect(matchingPalette(scheme.slice(0, count), 0.5)?.name, `${name} ${count}`).toBe(name);
      }
    }
    for (const count of [4, 8, 20]) {
      expect(matchingPalette(DISTRICT_PALETTES[0].colors.slice(0, count), 0.5)?.name).toBe(
        'Districtr default'
      );
    }
  });

  test('needs the minimum share', () => {
    expect(matchingPalette(['#123456', '#654321', '#8dd3c7'], 0.5)).toBeUndefined();
    expect(matchingPalette(['#123456'])).toBeUndefined();
  });
});

test('only colors near the unassigned fill look unassigned', () => {
  for (const color of ['#cecece', '#c0c0c0', '#d3d3d3', '#dcdcdc', '#d0cec4', '#c8cfd0']) {
    expect(looksUnassigned(color), color).toBe(true);
  }
  // Darker or lighter grays, white and black read as their own fills.
  for (const color of ['#b0b0b0', '#808080', '#ffffff', '#000000', '#bab0ab', '#cbd5e8']) {
    expect(looksUnassigned(color), color).toBe(false);
  }
  for (const {name, colors} of DISTRICT_PALETTES) {
    expect(colors.filter(looksUnassigned), name).toEqual([]);
  }
});

test('near-duplicate warnings spare every pair a palette ships', () => {
  expect(colorDistance('#0099cd', '#0099cf')).toBeLessThan(NEAR_DUPLICATE_DISTANCE);
  expect(colorDistance('#0099cd', '#0b9ad2')).toBeLessThan(NEAR_DUPLICATE_DISTANCE);
  for (const {name, colors} of DISTRICT_PALETTES) {
    for (const a of colors) {
      for (const b of colors) {
        if (a !== b)
          expect(colorDistance(a, b), `${name} ${a} ${b}`).toBeGreaterThanOrEqual(
            NEAR_DUPLICATE_DISTANCE
          );
      }
    }
  }
});

test('near-grays, including the unassigned fill, count as gray; pale tints do not', () => {
  for (const color of [
    '#cecece',
    '#c0c0c0',
    '#d3d3d3',
    '#000000',
    '#ffffff',
    '#bab0ab',
    '#d0cec4',
  ]) {
    expect(isNearGray(color), color).toBe(true);
  }
  for (const color of ['#cbd5e8', '#bebada', '#ffca5d', '#0099cd', '#a6cee3']) {
    expect(isNearGray(color), color).toBe(false);
  }
});

describe('color name search', () => {
  test('every suggestion resolves to the color it shows', () => {
    const index = colorNameIndex();
    expect(index.length).toBeGreaterThan(800);
    for (const entry of index) expect(resolveColorInput(entry.input), entry.input).toBe(entry.hex);
  });

  test('a LaTeX name CSS owns bare is picked with the prefix', () => {
    const forest = colorNameIndex().find(entry => entry.name === 'ForestGreen');
    expect(forest).toMatchObject({source: 'LaTeX', input: 'latex:ForestGreen', hex: '#00e000'});
  });

  test('ranks whole names, then prefixes, then word prefixes, then anywhere', () => {
    const names = (query: string) => searchColorNames(query, Infinity).map(entry => entry.name);
    expect(names('blue')[0]).toBe('blue');
    expect(names('blue').indexOf('blueviolet')).toBeLessThan(
      names('blue').indexOf('Air Force blue')
    );
    expect(names('blue').indexOf('Air Force blue')).toBeLessThan(
      names('blue').indexOf('aliceblue')
    );
  });

  test('normalizes the query like typed input', () => {
    expect(searchColorNames('airforceblue')[0].name).toBe('Air Force blue');
    expect(searchColorNames('AIR FORCE')[0].name).toBe('Air Force blue');
    expect(searchColorNames('tenne')[0].name).toBe('Tenné (Tawny)');
  });

  test('latex: limits results to LaTeX names', () => {
    const results = searchColorNames('latex:forest');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.source === 'LaTeX')).toBe(true);
  });

  test('offers nothing for hex or functional colors', () => {
    expect(searchColorNames('#ff0')).toEqual([]);
    expect(searchColorNames('rgb(1')).toEqual([]);
    expect(searchColorNames('  ')).toEqual([]);
    expect(searchColorNames('8').length).toBe(0);
  });
});
