import {describe, expect, test} from 'bun:test';
import {padBbox, queryRenderedGeoIdBounds, widenBbox} from './fitBounds';

describe('padBbox', () => {
  test('grows each side by a fraction of the size', () => {
    expect(padBbox([0, 0, 10, 4], 0.5)).toEqual([-5, -2, 15, 6]);
    expect(padBbox([0, 0, 10, 4], 0)).toEqual([0, 0, 10, 4]);
  });
});

describe('widenBbox', () => {
  test('nothing to widen when the seen box lies inside', () => {
    expect(widenBbox([0, 0, 10, 10], [2, 2, 8, 8])).toBeNull();
    expect(widenBbox([0, 0, 10, 10], [0, 0, 10, 10])).toBeNull();
  });

  test('the union when any side reaches past', () => {
    expect(widenBbox([0, 0, 10, 10], [5, 5, 12, 8])).toEqual([0, 0, 12, 10]);
    expect(widenBbox([0, 0, 10, 10], [-3, -1, 2, 2])).toEqual([-3, -1, 10, 10]);
  });
});

describe('queryRenderedGeoIdBounds', () => {
  test("unions a unit's pieces across tiles and layers", () => {
    const pieces: Record<string, any[]> = {
      parent: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [5, 0],
                [5, 5],
                [0, 0],
              ],
            ],
          },
        },
        {
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [5, 0],
                [9, 0],
                [9, 3],
                [5, 0],
              ],
            ],
          },
        },
      ],
      child: [{geometry: {type: 'Point', coordinates: [1, 7]}}],
    };
    const map = {querySourceFeatures: (_: string, {sourceLayer}: any) => pieces[sourceLayer]};
    const doc = {parent_layer: 'parent', child_layer: 'child'} as any;
    expect(queryRenderedGeoIdBounds(map as any, doc, ['A'])).toEqual([0, 0, 9, 7]);
  });

  test('null when no piece is loaded', () => {
    const map = {querySourceFeatures: () => []};
    expect(queryRenderedGeoIdBounds(map as any, {parent_layer: 'p'} as any, ['A'])).toBeNull();
  });
});
