import {describe, expect, test} from 'bun:test';
import {getBreakTarget} from './breakTarget';

// Blocks a1, a2 belong to broken unit A; b1 to broken unit B.
const childToParent = new Map([
  ['a1', 'A'],
  ['a2', 'A'],
  ['b1', 'B'],
]);

describe('getBreakTarget', () => {
  test('an unbroken unit is broken', () => {
    expect(getBreakTarget([{id: 'C'}], childToParent)).toEqual({units: [{id: 'C'}]});
  });

  test("a broken unit's block reopens the unit", () => {
    expect(getBreakTarget([{id: 'b1'}], childToParent)).toEqual({parentId: 'B'});
    // Also from inside another unit's block view.
    expect(getBreakTarget([{id: 'b1'}], childToParent, 'A')).toEqual({parentId: 'B'});
  });

  test("the open unit's own blocks target nothing", () => {
    expect(getBreakTarget([{id: 'a1'}, {id: 'a2'}], childToParent, 'A')).toBeNull();
    // ...but another unit under the same click still does.
    expect(getBreakTarget([{id: 'a1'}, {id: 'b1'}], childToParent, 'A')).toEqual({
      parentId: 'B',
    });
  });

  test('unbroken units win over a block at a shared edge', () => {
    expect(getBreakTarget([{id: 'b1'}, {id: 'C'}], childToParent)).toEqual({
      units: [{id: 'C'}],
    });
  });

  test('nothing clicked, nothing targeted', () => {
    expect(getBreakTarget([], childToParent)).toBeNull();
    expect(getBreakTarget([{id: undefined}], childToParent)).toBeNull();
  });
});
