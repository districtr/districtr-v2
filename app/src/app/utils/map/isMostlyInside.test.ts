import {expect, test} from 'bun:test';
import {isMostlyInside} from './isMostlyInside';

const square = (x: number, y: number, size: number) => ({
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y],
      ],
    ],
  },
});
const area = [square(0, 0, 10)] as any;

test('a unit counts as inside when more than a quarter of it overlaps the area', () => {
  expect(isMostlyInside(square(2, 2, 2) as any, area)).toBe(true); // all inside (fast path)
  expect(isMostlyInside(square(9, 4, 2) as any, area)).toBe(true); // half inside
  expect(isMostlyInside(square(9.8, 4, 2) as any, area)).toBe(false); // a tenth inside
  expect(isMostlyInside(square(20, 20, 2) as any, area)).toBe(false); // outside
});
