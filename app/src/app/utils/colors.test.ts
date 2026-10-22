import {afterAll, describe, expect, test} from 'bun:test';
import {DISTRICT_PALETTES} from '@/app/constants/colors';
import {extendColorArray, resolveColorInput} from './colors';

// Minimal stand-in for a canvas 2D context: knows hex plus two CSS names and,
// like a real canvas, ignores values it can't parse.
const CSS_NAMES: Record<string, string> = {orange: '#ffa500', rebeccapurple: '#663399'};
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
