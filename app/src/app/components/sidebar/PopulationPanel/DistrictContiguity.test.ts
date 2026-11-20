import {describe, expect, test} from 'bun:test';
import {
  MAX_PIECE_TARGETS,
  pieceAriaLabel,
  pieceLabel,
  splitPieceTargets,
} from './DistrictContiguity';

describe('tuning view piece targets', () => {
  test('every piece gets a target while they fit', () => {
    expect(MAX_PIECE_TARGETS).toBe(3);
    expect(splitPieceTargets(2)).toEqual({shown: [0, 1], overflow: []});
    expect(splitPieceTargets(3)).toEqual({shown: [0, 1, 2], overflow: []});
  });

  test('past the limit, the "+N" menu takes the last slot', () => {
    expect(splitPieceTargets(4)).toEqual({shown: [0, 1], overflow: [2, 3]});
    expect(splitPieceTargets(6, 4)).toEqual({shown: [0, 1, 2], overflow: [3, 4, 5]});
  });

  test('labels name the largest piece and add sizes once known', () => {
    expect(pieceLabel(0)).toBe('Largest piece');
    expect(pieceLabel(0, 312)).toBe('Largest piece · 312 units');
    expect(pieceLabel(1, 1)).toBe('Piece 2 · 1 unit');
    expect(pieceAriaLabel(0, '4')).toBe('Zoom to largest piece of district 4');
    expect(pieceAriaLabel(2, 'North', 3)).toBe('Zoom to piece 3 of district North, 3 units');
  });
});
