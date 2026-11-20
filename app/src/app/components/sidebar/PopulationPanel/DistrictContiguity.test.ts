import {expect, test} from 'bun:test';
import {pieceLabel} from './DistrictContiguity';

test('piece labels name the largest piece and add sizes once known', () => {
  expect(pieceLabel(0)).toBe('Largest piece');
  expect(pieceLabel(0, 312)).toBe('Largest piece · 312 units');
  expect(pieceLabel(1, 1)).toBe('Piece 2 · 1 unit');
});
