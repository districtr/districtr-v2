import {describe, expect, test} from 'bun:test';
import {formatAssignmentsFromDocument} from './formatAssignments';
import {formatCoiAssignmentsFromDocument} from './formatCoiAssignments';

describe('formatAssignmentsFromDocument', () => {
  test('drops a row saved for a parent that also has shattered children', () => {
    const {zoneAssignments, shatterIds} = formatAssignmentsFromDocument([
      {geo_id: 'vtd:A', zone: 19, parent_path: null},
      {geo_id: 'a1', zone: null, parent_path: 'vtd:A'},
      {geo_id: 'a2', zone: 3, parent_path: 'vtd:A'},
      {geo_id: 'vtd:B', zone: 5, parent_path: null},
    ] as any);
    expect(zoneAssignments.has('vtd:A')).toBe(false);
    expect([...zoneAssignments]).toEqual([
      ['a1', null],
      ['a2', 3],
      ['vtd:B', 5],
    ]);
    expect([...shatterIds.parents]).toEqual(['vtd:A']);
  });
});

describe('formatCoiAssignmentsFromDocument', () => {
  test('drops a shattered parent from every community it was saved in', () => {
    const {communityAssignments} = formatCoiAssignmentsFromDocument([
      {geo_id: 'vtd:A', zone: 2, parent_path: null},
      {geo_id: 'vtd:A', zone: 3, parent_path: null},
      {geo_id: 'a1', zone: 2, parent_path: 'vtd:A'},
      {geo_id: 'a2', zone: null, parent_path: 'vtd:A'},
      {geo_id: 'vtd:B', zone: 2, parent_path: null},
    ] as any);
    expect([...communityAssignments.get(2)!]).toEqual(['a1', 'vtd:B']);
    expect([...communityAssignments.get(3)!]).toEqual([]);
  });
});
