/**
 * Which districts' contiguity an edit can have changed. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {touchedZones, type PlanUnits} from './touchedZones';

const plan = (
  assignments: Record<string, number | null>,
  childToParent: Record<string, string> = {}
): PlanUnits => ({
  zoneAssignments: new Map(Object.entries(assignments)),
  childToParent: new Map(Object.entries(childToParent)),
});

// Unit P is made of blocks p1, p2, p3.
const BLOCKS = {p1: 'P', p2: 'P', p3: 'P'};
const saved = plan({a: 1, b: 1, c: 2, P: 2, d: 3});

const touched = (before: PlanUnits, after: PlanUnits) =>
  [...touchedZones(before, after)].sort((x, y) => x - y);

describe('touchedZones', () => {
  test('no change touches nothing', () => {
    expect(touched(saved, plan({a: 1, b: 1, c: 2, P: 2, d: 3}))).toEqual([]);
  });

  test('a moved unit touches the district it left and the one it joined', () => {
    expect(touched(saved, plan({a: 1, b: 3, c: 2, P: 2, d: 3}))).toEqual([1, 3]);
  });

  test('an erased unit touches its district, as null or as gone', () => {
    expect(touched(saved, plan({a: 1, b: 1, c: null, P: 2, d: 3}))).toEqual([2]);
    expect(touched(saved, plan({a: 1, b: 1, P: 2, d: 3}))).toEqual([2]);
  });

  test('a newly painted unit touches only the district it joined', () => {
    expect(touched(saved, plan({a: 1, b: 1, c: 2, P: 2, d: 3, e: 3}))).toEqual([3]);
    // Unassigned in both, as null or missing: nothing.
    expect(touched(saved, plan({a: 1, b: 1, c: 2, P: 2, d: 3, f: null}))).toEqual([]);
  });

  test('a break alone touches nothing; a block painted away touches both', () => {
    const broken = {a: 1, b: 1, c: 2, p1: 2, p2: 2, p3: 2, d: 3};
    expect(touched(saved, plan(broken, BLOCKS))).toEqual([]);
    expect(touched(saved, plan({...broken, p2: 1}, BLOCKS))).toEqual([1, 2]);
    // Erasing a block (blocks stay listed, unassigned) touches its district.
    expect(touched(saved, plan({...broken, p3: null}, BLOCKS))).toEqual([2]);
  });

  test('a heal alone touches nothing; one that moved a block touches both', () => {
    const brokenSaved = plan({a: 1, p1: 2, p2: 2, p3: 3}, BLOCKS);
    // The blocks were all painted 2 and the unit healed: p3 left 3 for 2.
    expect(touched(brokenSaved, plan({a: 1, P: 2}))).toEqual([2, 3]);
    const uniform = plan({a: 1, p1: 2, p2: 2, p3: 2}, BLOCKS);
    expect(touched(uniform, plan({a: 1, P: 2}))).toEqual([]);
  });

  test('a renumbering touches both numbers of each district renumbered', () => {
    expect(touched(saved, plan({a: 3, b: 3, c: 2, P: 2, d: 1}))).toEqual([1, 3]);
  });
});
