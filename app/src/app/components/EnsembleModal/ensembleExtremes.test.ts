/**
 * Which extreme plans the histogram marks by default, and how coinciding
 * markers are moved apart. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {
  isRelevantObjective,
  objectiveRank,
  relevantObjectives,
  spreadMarkers,
} from './ensembleExtremes';

describe('relevantObjectives', () => {
  test('every partisan series shows the two partisan searches', () => {
    for (const id of ['seats', 'disproportionality', 'efficiency_gap', 'mean_median', 'eguia']) {
      expect(relevantObjectives(id)).toEqual(['dem_seats', 'rep_seats']);
    }
  });

  test('competitiveness counts show the competitiveness search', () => {
    expect(relevantObjectives('n_competitive_contests')).toEqual(['competitive']);
    expect(relevantObjectives('n_swing_districts')).toEqual(['competitive']);
  });

  test('splits and compactness series show their own search', () => {
    expect(relevantObjectives('county_splits')).toEqual(['county_splits']);
    expect(relevantObjectives('county_pieces')).toEqual(['county_splits']);
    expect(relevantObjectives('cut_edges')).toEqual(['cut_edges']);
    expect(relevantObjectives('polsby_popper_mean')).toEqual(['polsby_popper']);
    expect(relevantObjectives('polsby_popper_min')).toEqual(['polsby_popper']);
    expect(relevantObjectives('reock_mean')).toEqual(['polsby_popper']);
  });

  test('an unknown series shows none', () => {
    expect(relevantObjectives('something_else')).toEqual([]);
  });

  test('isRelevantObjective reads the same table', () => {
    expect(isRelevantObjective('seats', 'rep_seats')).toBe(true);
    expect(isRelevantObjective('seats', 'cut_edges')).toBe(false);
  });

  test('legend order follows the objective list, unknown keys last', () => {
    expect(objectiveRank('dem_seats')).toBeLessThan(objectiveRank('polsby_popper'));
    expect(objectiveRank('unknown')).toBe(6);
  });
});

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
