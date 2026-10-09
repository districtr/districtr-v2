import {describe, expect, test} from 'bun:test';
import {arcFeature, boundaryArcs, boundaryDiff, unitAssignment} from './boundaries';
import {arcOf, side, unitPath} from './access';
import {gridTopology} from './testTopology';
import type {Topology} from './types';

/** Active units on either side of each boundary arc, as sorted "a|b" path pairs. */
const sidePairs = (topo: Topology, arcs: Set<number>) =>
  [...arcs]
    .map(arc => {
      const {chunk, local} = arcOf(topo, arc)!;
      const name = (u: number) => (u < 0 ? 'out' : unitPath(topo, u));
      return [name(side(topo, chunk, local, 'a')), name(side(topo, chunk, local, 'b'))]
        .sort()
        .join('|');
    })
    .sort();

describe('boundaryArcs', () => {
  const topo = gridTopology();

  test('empty plan has no boundaries', () => {
    expect(boundaryArcs(topo, unitAssignment(topo, new Map())).size).toBe(0);
  });

  test('toy assignment: one parent and one child of the shattered parent', () => {
    // Parent 1 is north of shattered parent 4, whose child b4_0 sits under parent 1's
    // west cell; b4_1 under its east cell.
    const assignment = unitAssignment(
      topo,
      new Map<string, number | null>([
        ['vtd:P1', 1],
        ['b4_0', 1],
        ['b4_1', 2],
        ['vtd:P4', 3], // shattered: ignored in favor of its children
        ['vtd:missing', 1],
        ['vtd:P8', null],
      ])
    );
    const arcs = boundaryArcs(topo, assignment);
    expect(sidePairs(topo, arcs)).toEqual(
      [
        // Parent 1 (2×2 cells): north outline ×2, west to P0 ×2, east to P2 ×2,
        // south to b4_1 (zone 2) ×1; the edge to b4_0 is same-zone.
        'out|vtd:P1',
        'out|vtd:P1',
        'vtd:P0|vtd:P1',
        'vtd:P0|vtd:P1',
        'vtd:P1|vtd:P2',
        'vtd:P1|vtd:P2',
        'b4_1|vtd:P1',
        // b4_0: west to P3, south to b4_2 (interior), east to b4_1 (interior).
        'b4_0|vtd:P3',
        'b4_0|b4_2',
        'b4_0|b4_1',
        // b4_1: east to P5, south to b4_3 (interior).
        'b4_1|vtd:P5',
        'b4_1|b4_3',
      ].sort()
    );
  });

  test('healing drops the interior arcs and reads the parent', () => {
    const t = gridTopology();
    const zones = new Map<string, number | null>([['vtd:P4', 1]]);
    t.shattered.clear();
    t.version++;
    // Parent 4's outline: 8 exterior arcs.
    expect(boundaryArcs(t, unitAssignment(t, zones)).size).toBe(8);
  });
});

test('boundaryDiff adds and removes by arc id', () => {
  const topo = gridTopology();
  const first = boundaryArcs(topo, unitAssignment(topo, new Map([['vtd:P0', 1]])));
  const initial = boundaryDiff(topo, new Set(), first);
  expect(initial.remove).toEqual([]);
  expect(initial.add!.map(f => f.id).sort()).toEqual([...first].sort());
  const second = boundaryArcs(
    topo,
    unitAssignment(
      topo,
      new Map([
        ['vtd:P0', 1],
        ['vtd:P1', 1],
      ])
    )
  );
  const diff = boundaryDiff(topo, first, second);
  // The P0|P1 edge (2 arcs) disappears; P1's other 6 outline arcs appear.
  expect(diff.remove!.length).toBe(2);
  expect(diff.add!.length).toBe(6);
  const f = arcFeature(topo, [...second][0])!;
  expect(f.geometry.coordinates.length).toBe(3);
  expect(f.geometry.coordinates[0][0]).toBeLessThan(-100);
});
