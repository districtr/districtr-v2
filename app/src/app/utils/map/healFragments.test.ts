import {describe, expect, test} from 'bun:test';
import {planHeal} from './healFragments';

const pop: Record<string, number> = {a: 1, b: 1, c: 100, d: 5, e: 7, f: 3};
const assignments = new Map(Object.keys(pop).map(id => [id, 1]));
// Server order is by unit count: [a, b] has the most units, but [c] the most people.
const components = [
  {geo_ids: ['a', 'b'], neighbor_zones: {'2': 1}},
  {geo_ids: ['c'], neighbor_zones: {'2': 4}},
  {geo_ids: ['d'], neighbor_zones: {'2': 1, '3': 5}},
  {geo_ids: ['e'], neighbor_zones: {}},
  {geo_ids: ['f'], neighbor_zones: {'3': 2}},
];

describe('planHeal', () => {
  test('keeps the most populous component and moves fragments to the most-bordered district', () => {
    const plan = planHeal(1, components, assignments, [], id => pop[id]);
    expect(Object.fromEntries(plan.moves)).toEqual({a: 2, b: 2, d: 3, f: 3});
    expect(plan.byTarget).toEqual([
      {zone: 2, units: 2, population: 2},
      {zone: 3, units: 2, population: 8},
    ]);
    expect(plan.skippedNoNeighbor).toBe(1);
  });

  test('falls back to unit count without population', () => {
    const plan = planHeal(1, components, assignments, [], () => undefined);
    expect(plan.moves.has('a')).toBe(false);
    expect(plan.moves.get('c')).toBe(2);
  });

  test('skips locked targets, a locked source, and units no longer in the zone', () => {
    const stale = new Map(assignments).set('a', 2);
    const plan = planHeal(1, components, stale, [3], id => pop[id]);
    expect(Object.fromEntries(plan.moves)).toEqual({b: 2, d: 2});
    expect(plan.skippedLocked).toBe(1);
    expect(plan.skippedStale).toBe(1);
    expect(planHeal(1, components, assignments, [1], id => pop[id]).moves.size).toBe(0);
  });
});
