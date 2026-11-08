/**
 * How the histogram's coinciding markers are moved apart. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {spreadMarkers} from './ensembleMarkers';

describe('spreadMarkers', () => {
  test('markers already apart stay put', () => {
    expect(spreadMarkers([0, 100], 4)).toEqual([0, 100]);
  });

  test('two close markers move symmetrically apart', () => {
    expect(spreadMarkers([10, 11], 4)).toEqual([8.5, 12.5]);
  });

  test('coinciding markers spread evenly around their value', () => {
    expect(spreadMarkers([50, 50, 50], 4)).toEqual([46, 50, 54]);
  });

  test('a spread cluster that reaches its neighbour absorbs it', () => {
    const result = spreadMarkers([0, 3, 7], 4);
    expect(result[0]).toBeCloseTo(-2 / 3);
    expect(result[1]).toBeCloseTo(10 / 3);
    expect(result[2]).toBeCloseTo(22 / 3);
  });

  test('output keeps input order', () => {
    const result = spreadMarkers([11, 10], 4);
    expect(result).toEqual([12.5, 8.5]);
  });
});
