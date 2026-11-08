/**
 * The diagnosis section's pure logic. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {
  assignmentPairs,
  decodeBase64,
  decodeRow,
  headlineMetrics,
  metricAt,
  offsetInRange,
  rangeIndexOf,
  toZones,
} from './diagCodec';
import {
  mergeRegistries,
  parseRegistry,
  registryExport,
  upsertEntry,
} from './diagRegistry';
import {
  fixtureNodes,
  fixturePreset,
  fixtureRange0,
  fixtureRange1,
} from './__fixtures__/diagFixture';
import type {DiagRegistryEntry} from './diagTypes';

describe('base64 row decoding', () => {
  test('decodes bytes', () => {
    expect([...decodeBase64('AAABAQABAQE=')]).toEqual([0, 0, 1, 1, 0, 1, 1, 1]);
  });
  test('slices the step row in each range file', () => {
    expect([...decodeRow(fixtureRange0, 0, 4)]).toEqual([0, 0, 1, 1]);
    expect([...decodeRow(fixtureRange0, 1, 4)]).toEqual([0, 1, 1, 1]);
    expect([...decodeRow(fixtureRange1, 2, 4)]).toEqual([1, 0, 0, 1]);
    expect([...decodeRow(fixtureRange1, 3, 4)]).toEqual([1, 1, 0, 0]);
  });
  test('rejects a step outside the file', () => {
    expect(() => decodeRow(fixtureRange0, 2, 4)).toThrow();
  });
});

describe('zone mapping', () => {
  test('shifts 0-based labels to start at 1', () => {
    expect(toZones(Uint8Array.from([0, 1, 1, 0]))).toEqual([1, 2, 2, 1]);
  });
  test('keeps 1-based labels', () => {
    expect(toZones(Uint8Array.from([1, 2, 2, 1]))).toEqual([1, 2, 2, 1]);
  });
  test('pairs unit ids with string zones', () => {
    expect(assignmentPairs(fixtureNodes, Uint8Array.from([0, 0, 1, 1]))).toEqual([
      ['vtd:1', '1'],
      ['vtd:2', '1'],
      ['vtd:3', '2'],
      ['vtd:4', '2'],
    ]);
  });
  test('rejects a row of the wrong length', () => {
    expect(() => assignmentPairs(fixtureNodes, Uint8Array.from([0, 1]))).toThrow();
  });
});

describe('range-file indexing', () => {
  test('file index and offset', () => {
    expect(rangeIndexOf(0, 2)).toBe(0);
    expect(rangeIndexOf(3, 2)).toBe(1);
    expect(rangeIndexOf(2500, 1000)).toBe(2);
    expect(offsetInRange(3, fixtureRange1)).toBe(1);
  });
  test('metric at a step', () => {
    expect(metricAt(fixtureRange1, 'county_splits', 3)).toBe(4);
    expect(metricAt(fixtureRange0, 'cut_edges', 0)).toBe(10);
    expect(metricAt(fixtureRange0, 'missing', 0)).toBeUndefined();
  });
});

describe('headline metrics', () => {
  test('matches by key and picks the latest presidential seats', () => {
    const got = Object.fromEntries(
      headlineMetrics(fixturePreset.metrics).map(h => [h.role, h.info.key])
    );
    expect(got).toEqual({
      'County splits': 'county_splits',
      'County pieces': 'county_pieces',
      'Polsby-Popper mean': 'polsby_popper_mean',
      'Dem seats (latest presidential)': 'seats__pres_20',
      'Cut edges': 'cut_edges',
    });
  });
});

const entry = (preset: string, step: number, note = '', public_id = 1): DiagRegistryEntry => ({
  preset,
  step,
  public_id,
  note,
  when: '2026-01-01',
});

describe('registry', () => {
  test('merge deduplicates by preset and step, browser wins', () => {
    const merged = mergeRegistries(
      [entry('a', 1, 'seed', 10), entry('a', 2, '', 11)],
      [entry('a', 1, 'mine', 10), entry('b', 1, '', 12)]
    );
    expect(merged.length).toBe(3);
    expect(merged.find(e => e.preset === 'a' && e.step === 1)?.note).toBe('mine');
  });
  test('upsert replaces the same preset and step', () => {
    expect(upsertEntry([entry('a', 1, 'x')], entry('a', 1, 'y')).map(e => e.note)).toEqual(['y']);
  });
  test('export and parse carry the public id only', () => {
    const dirty = {...entry('a', 1), document_id: 'secret-uuid'} as DiagRegistryEntry;
    const json = registryExport([dirty]);
    expect(json.includes('secret-uuid')).toBe(false);
    expect(parseRegistry(json)).toEqual([entry('a', 1)]);
  });
  test('parse tolerates junk', () => {
    expect(parseRegistry('not json')).toEqual([]);
    expect(parseRegistry(null)).toEqual([]);
  });
});
