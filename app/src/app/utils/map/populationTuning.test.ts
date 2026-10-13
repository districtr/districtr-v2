/** Run with `bun test`. */
import {describe, expect, test} from 'bun:test';
import type {Polygon} from 'geojson';
import {buildViewGraph, findTuneOptions, type TuneUnit} from './populationTuning';

const square = (x: number, y: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
      [x, y],
    ],
  ],
});

describe('buildViewGraph', () => {
  test('edge neighbors only, tile-split pieces merged', () => {
    const f = (id: string, x: number, y: number) => ({
      id,
      sourceLayer: 'blocks',
      properties: {total_pop_20: '5'},
      geometry: square(x, y),
    });
    // a | b side by side; c sits on b's top edge and only touches a's corner.
    const {units, neighbors} = buildViewGraph(
      [f('a', 0, 0), f('b', 1, 0), f('b', 1, 0), f('c', 1, 1)],
      () => null,
      0.1
    );
    expect(units.map(u => u.id)).toEqual(['a', 'b', 'c']);
    expect([...neighbors.get('a')!]).toEqual(['b']);
    expect([...neighbors.get('b')!].sort()).toEqual(['a', 'c']);
    expect(neighbors.get('c')!.has('a')).toBe(false);
  });
});

describe('findTuneOptions', () => {
  const u = (id: string, zone: number | null, pop: number): TuneUnit => ({
    id,
    sourceLayer: 'blocks',
    zone,
    pop,
  });
  const units = [u('a', 1, 100), u('b', 2, 5), u('c', 3, 7), u('d', 2, 12), u('e', 1, 3)];
  const edges = [
    ['a', 'b'],
    ['a', 'c'],
    ['a', 'd'],
    ['e', 'b'],
  ];
  const neighbors = new Map<string, Set<string>>();
  for (const [x, y] of edges) {
    neighbors.set(x, (neighbors.get(x) ?? new Set()).add(y));
    neighbors.set(y, (neighbors.get(y) ?? new Set()).add(x));
  }
  const deviations = new Map([
    [1, -12],
    [2, 5],
    [3, 7],
  ]);
  const describeOption = (o: ReturnType<typeof findTuneOptions>[number]) =>
    o.moves
      .map(m => `${m.unit.id}>${m.to}`)
      .sort()
      .join(',');

  test('exact single first, then the exact pair that also fixes both neighbors', () => {
    const options = findTuneOptions({units, neighbors, target: 1, deviations});
    expect(describeOption(options[0])).toBe('d>1');
    expect(describeOption(options[1])).toBe('b>1,c>1');
    expect(options[1].after).toEqual(
      new Map([
        [1, 0],
        [2, 0],
        [3, 0],
      ])
    );
    expect(options[1].collateral).toBe(-12);
    // Every exact option sorts ahead of every inexact one.
    const firstInexact = options.findIndex(o => o.error >= 1);
    expect(options.slice(firstInexact).every(o => o.error >= 1)).toBe(true);
  });

  test('swaps push target units out; canMove filters', () => {
    const options = findTuneOptions({
      units,
      neighbors,
      target: 1,
      deviations: new Map([
        [1, -2],
        [2, 0],
      ]),
      canMove: unit => unit.id !== 'd',
    });
    // +5 in from b, −3 out to b's district: a swap landing at −2 + 2 = 0.
    expect(describeOption(options[0])).toBe('b>1,e>2');
    expect(options.some(o => o.moves.some(m => m.unit.id === 'd'))).toBe(false);
  });

  test('already at ideal → nothing to do', () => {
    expect(findTuneOptions({units, neighbors, target: 1, deviations: new Map([[1, 0.4]])})).toEqual(
      []
    );
  });
});
