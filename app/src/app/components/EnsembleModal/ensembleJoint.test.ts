/**
 * The density grid and the conditional-slice sentence of the "Two metrics at
 * once" section, on small hand-computed pairs and on the package fixtures.
 * Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {
  axisCoordinate,
  buildJointGrid,
  cellLabel,
  displayAxis,
  histogramMedian,
  rawAxis,
  sliceComparison,
  sliceGoal,
  sliceSentence,
} from './ensembleJoint';
import {findEnsembleMetric, metricForRef} from './ensembleMetrics';
import type {EnsembleJoint} from './ensembleTypes';
import cutEdgesSplits from './__fixtures__/co_congressional_districts_v2/recom_b/joint/cut_edges__county_splits.json';
import disproportionalitySplits from './__fixtures__/co_congressional_districts_v2/recom_b/joint/disproportionality_pres_24__county_splits.json';

const def = (id: string) => findEnsembleMetric(id)!;

/** x = 0..3, y = 0..2; the highest-x column (10 plans) all sits at y = 2. */
const integerPair: EnsembleJoint = {
  x: {metric: 'n_competitive_contests'},
  y: {metric: 'county_splits'},
  x_kind: 'integer',
  x_edges: [0, 1, 2, 3, 4],
  y_kind: 'integer',
  y_edges: [0, 1, 2, 3],
  counts: [
    [29, 10, 5, 0],
    [10, 20, 16, 0],
    [0, 0, 0, 10],
  ],
  n: 100,
};

describe('sliceComparison', () => {
  test('top decile by the highest values, against the rest', () => {
    const result = sliceComparison(integerPair, 'max')!;
    expect(result.groupShare).toBeCloseTo(0.1);
    expect(result.groupMedian).toBe(2);
    expect(result.restMedian).toBe(1);
    expect(result.delta).toBe(1);
    expect(result.same).toBe(false);
  });

  test('whole columns: the group holds the share nearest a tenth', () => {
    const result = sliceComparison(integerPair, 'min')!;
    expect(result.groupShare).toBeCloseTo(0.39);
    expect(result.groupMedian).toBe(0);
    expect(result.restMedian).toBe(1);
  });

  test('columns tied on closeness to zero join the group together', () => {
    const pair: EnsembleJoint = {
      x: {metric: 'disproportionality', election: 'pres_24'},
      y: {metric: 'polsby_popper', stat: 'mean'},
      x_kind: 'discrete',
      x_edges: [-0.1, 0.1, 0.3],
      y_kind: 'continuous',
      y_edges: [0, 0.5, 1],
      counts: [
        [5, 0, 40],
        [0, 5, 50],
      ],
      n: 100,
    };
    const result = sliceComparison(pair, 'zero')!;
    expect(result.groupShare).toBeCloseTo(0.1);
    expect(result.groupMedian).toBeCloseTo(0.5);
    expect(result.restMedian).toBeCloseTo(0.55);
    expect(result.same).toBe(true);
  });

  test('no slice when the best column holds half the plans', () => {
    const pair: EnsembleJoint = {
      ...integerPair,
      counts: [
        [0, 0, 0, 60],
        [10, 10, 10, 10],
        [0, 0, 0, 0],
      ],
    };
    expect(sliceComparison(pair, 'max')).toBeNull();
  });
});

describe('sliceSentence', () => {
  test('names the preset, the plan count and the direction', () => {
    const result = sliceComparison(integerPair, 'max')!;
    expect(
      sliceSentence({
        result,
        preset: 'ReCom-B',
        x: {def: def('n_competitive_contests')},
        y: {def: def('county_splits')},
      })
    ).toBe(
      'Among the 100 plans drawn by the ReCom-B recipe, the tenth with the most competitive contests split a median of 2 counties, 1 more than the rest.'
    );
  });

  test('a group away from a tenth is stated as its share', () => {
    const result = sliceComparison(integerPair, 'min')!;
    expect(
      sliceSentence({
        result,
        preset: 'ReCom-B',
        x: {def: def('cut_edges')},
        y: {def: def('county_splits')},
      })
    ).toBe(
      'Among the 100 plans drawn by the ReCom-B recipe, the 39% of plans with the fewest cut edges split a median of 0 counties, 1 fewer than the rest.'
    );
  });

  test('equal medians read as the same, with the election named', () => {
    const sentence = sliceSentence({
      result: {
        groupShare: 0.1,
        groupMedian: 0.5,
        restMedian: 0.55,
        delta: -0.05,
        same: true,
        n: 100,
      },
      preset: 'ReCom-B',
      x: {def: def('disproportionality'), election: 'pres_24'},
      y: {def: def('polsby_popper_mean')},
    });
    expect(sentence).toBe(
      'Among the 100 plans drawn by the ReCom-B recipe, the tenth closest to proportional in the 2024 PRES results have a median mean Polsby-Popper score of 0.500, the same as the rest.'
    );
  });

  test('a percentage series states its difference in points', () => {
    const sentence = sliceSentence({
      result: {
        groupShare: 0.1,
        groupMedian: 0.05,
        restMedian: 0.02,
        delta: 0.03,
        same: false,
        n: 100,
      },
      preset: 'ReCom-B',
      x: {def: def('n_competitive_contests')},
      y: {def: def('disproportionality'), election: 'pres_24'},
    });
    expect(sentence).toContain('3.0 percentage points higher than the rest');
  });
});

describe('slice goals', () => {
  test('proportionality scores aim at zero, splits and cut edges low, the rest high', () => {
    expect(sliceGoal('disproportionality')).toBe('zero');
    expect(sliceGoal('cut_edges')).toBe('min');
    expect(sliceGoal('county_splits')).toBe('min');
    expect(sliceGoal('n_competitive_contests')).toBe('max');
    expect(sliceGoal('seats')).toBe('max');
  });
});

describe('axes and grid', () => {
  test('integer medians split between two values sit at their midpoint', () => {
    const axis = rawAxis('integer', [0, 1, 2], 2);
    expect(histogramMedian('integer', axis.cells, [5, 5])).toBe(0.5);
  });

  test('a wide integer axis is grouped into ranges of values', () => {
    const edges = Array.from({length: 151}, (_, i) => 4400 + i);
    const axis = displayAxis(rawAxis('integer', edges, 150), 60);
    expect(axis.cells).toHaveLength(50);
    expect(axis.sources[0]).toEqual([0, 2]);
    expect(cellLabel(axis, 0, 'count')).toBe('4,400 to 4,402');
  });

  test('a discrete axis places values by column', () => {
    const axis = rawAxis('discrete', [-0.18, -0.06, 0.07], 3);
    expect(axisCoordinate(axis, -0.06)).toBe(1);
    expect(axisCoordinate(axis, 0.005)).toBeCloseTo(1.5);
    expect(axisCoordinate(axis, -0.5)).toBe(-0.5);
  });

  test('series references resolve to the modal metrics', () => {
    expect(metricForRef({metric: 'polsby_popper', election: null, stat: 'mean'})?.def.id).toBe(
      'polsby_popper_mean'
    );
    expect(metricForRef({metric: 'seats', election: 'pres_24', stat: null})?.election).toBe(
      'pres_24'
    );
    expect(metricForRef({metric: 'seats', election: null, stat: null})).toBeUndefined();
  });
});

describe('fixtures', () => {
  const cut = cutEdgesSplits as unknown as EnsembleJoint;
  const disproportionality = disproportionalitySplits as unknown as EnsembleJoint;

  test('the grid draws every plan once', () => {
    const grid = buildJointGrid(cut, 60)!;
    expect(grid.x.cells).toHaveLength(50);
    expect(grid.y.cells).toHaveLength(27);
    const total = grid.shares.flat().reduce((sum, share) => sum + share, 0);
    expect(total).toBeCloseTo(1);
  });

  test('fewer cut edges come with fewer split counties', () => {
    const result = sliceComparison(cut, sliceGoal('cut_edges'))!;
    expect(result.n).toBe(100_000);
    expect(result.groupShare).toBeGreaterThan(0.05);
    expect(result.groupShare).toBeLessThan(0.15);
    expect(result.delta).toBeLessThan(0);
  });

  test('the plans closest to proportional are one seat outcome', () => {
    const result = sliceComparison(disproportionality, sliceGoal('disproportionality'))!;
    expect(result.groupShare).toBeCloseTo(0.25, 2);
    expect(result.delta).toBeGreaterThan(0);
  });
});
