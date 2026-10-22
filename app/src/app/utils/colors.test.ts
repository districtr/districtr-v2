import {describe, expect, test} from 'bun:test';
import {DISTRICT_PALETTES} from '@/app/constants/colors';
import {extendColorArray, resolveColorInput} from './colors';

describe('resolveColorInput', () => {
  // No DOM under bun test, so CSS names resolve to null here; only the LaTeX table is exercised.
  test('resolves dvipsnames exactly and case-insensitively', () => {
    expect(resolveColorInput('ForestGreen')).toBe('#00e000');
    expect(resolveColorInput('  BrickRed ')).toBe('#b80000');
    expect(resolveColorInput('brickred')).toBe('#b80000');
    // Exact-case dvipsnames beat CSS: `Orange` is LaTeX's, `orange` stays CSS's.
    expect(resolveColorInput('Orange')).toBe('#ff6321');
  });

  test('rejects empty and unknown input, including Object prototype keys', () => {
    expect(resolveColorInput('')).toBeNull();
    expect(resolveColorInput('notacolor')).toBeNull();
    expect(resolveColorInput('constructor')).toBeNull();
  });
});

test('short palettes extend to the district count without repeating colors', () => {
  const okabeIto = DISTRICT_PALETTES.find(p => p.name === 'Okabe-Ito')!.colors;
  const scheme = extendColorArray([...okabeIto], 20);
  expect(scheme).toHaveLength(20);
  expect(scheme.slice(0, okabeIto.length)).toEqual([...okabeIto]);
  expect(new Set(scheme).size).toBe(20);
});
