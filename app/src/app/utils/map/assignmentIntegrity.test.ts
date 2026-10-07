import {describe, expect, test} from 'bun:test';
import {findMissingBlocks, findParentRows, suggestParentRowChoice} from './assignmentIntegrity';

describe('assignment integrity checks', () => {
  test('flags broken-up units that still have their own row', () => {
    const assigned = new Set(['vtd:A', 'a1', 'vtd:C']);
    expect(findParentRows(new Set(['vtd:A', 'vtd:B']), id => assigned.has(id))).toEqual(['vtd:A']);
  });

  test('reports blocks missing per unit, and units with no edges as unverified', () => {
    const edges = [
      {parent_path: 'vtd:A', child_path: 'a1'},
      {parent_path: 'vtd:A', child_path: 'a2'},
      {parent_path: 'vtd:B', child_path: 'b1'},
    ];
    const {missingBlocks, unverified} = findMissingBlocks(
      ['vtd:A', 'vtd:B', 'vtd:C'],
      edges,
      new Set(['a1', 'b1'])
    );
    expect([...missingBlocks]).toEqual([['vtd:A', ['a2']]]);
    expect(unverified).toEqual(['vtd:C']);
  });

  test('suggests keeping blocks only when some block carries an assignment', () => {
    const assigned = new Set(['a2']);
    const isAssigned = (id: string) => assigned.has(id);
    expect(suggestParentRowChoice(['a1', 'a2'], isAssigned)).toBe('blocks');
    expect(suggestParentRowChoice(['b1', 'b2'], isAssigned)).toBe('whole');
  });
});
