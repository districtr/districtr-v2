import {describe, expect, test} from 'bun:test';
import {MercatorCoordinate} from 'maplibre-gl';
import {selectUnits, unitGeometry} from './select';
import {getIndexes} from './indexes';
import {toLngLat} from './boundaries';
import {CELL, at, gridTopology} from './testTopology';

// Parents 0..8 in a 3×3 grid (row-major, north row first), 2×2 cells each; parent 4 is
// shattered, so its children 9 + 16..19 = 25..28 are active instead.
const select = (
  topo: ReturnType<typeof gridTopology>,
  p: {x: number; y: number},
  r: number,
  q = p
) => [...selectUnits(topo, p.x, p.y, q.x, q.y, r)].sort((a, b) => a - b);

describe('selectUnits', () => {
  const topo = gridTopology();

  test('a disk inside one unit selects it by containment', () => {
    expect(select(topo, at(1, 1), 0.2 * CELL)).toEqual([0]);
    // Radius 0 (a click) is point-in-polygon only.
    expect(select(topo, at(4.5, 1.5), 0)).toEqual([2]);
  });

  test('a disk reaching across an edge selects both sides', () => {
    // Parent 0 spans x in [0, 2); centered 0.1 cells from its east edge.
    expect(select(topo, at(1.9, 1), 0.05 * CELL)).toEqual([0]);
    expect(select(topo, at(1.9, 1), 0.15 * CELL)).toEqual([0, 1]);
    // Near the corner shared by parents 0, 1, 3 and 4 (shattered: child 25 touches it).
    expect(select(topo, at(1.95, 1.95), 0.1 * CELL)).toEqual([0, 1, 3, 25]);
  });

  test('distance is to the nearest segment of a multi-vertex arc', () => {
    // Edge x = 2, y in [0, 1] has a midpoint vertex at (2, 0.5).
    expect(select(topo, at(2.3, 0.5), 0.31 * CELL)).toEqual([0, 1]);
  });

  test('a capsule covers the gap between brush positions', () => {
    // From inside parent 0 to inside parent 2: the disks alone miss parent 1.
    expect(select(topo, at(1, 1), 0.1 * CELL)).toEqual([0]);
    expect(select(topo, at(5, 1), 0.1 * CELL)).toEqual([2]);
    expect(select(topo, at(1, 1), 0.1 * CELL, at(5, 1))).toEqual([0, 1, 2]);
    // A diagonal capsule through the shattered parent's children.
    expect(select(topo, at(2.2, 2.2), 0.01 * CELL, at(3.8, 3.8))).toEqual([25, 26, 27, 28]);
  });

  test('sides of a shattered parent resolve to its children', () => {
    // Edge between parent 1 (above) and shattered parent 4, over child 4_0 (= 25).
    expect(select(topo, at(2.5, 2.05), 0.1 * CELL)).toEqual([1, 25]);
    // Interior arc between children 4_0 and 4_1.
    expect(select(topo, at(3.05, 2.5), 0.1 * CELL)).toEqual([25, 26]);
    // Containment inside a child.
    expect(select(topo, at(3.5, 3.5), 0.1 * CELL)).toEqual([28]);
  });

  test('indexes rebuild when the shatter state changes', () => {
    const t = gridTopology();
    expect(select(t, at(1, 1), 0.2 * CELL)).toEqual([0]);
    t.shattered.add(0);
    t.version++;
    expect(select(t, at(1, 1), 0.2 * CELL)).toEqual([9, 10, 11, 12]);
    expect(getIndexes(t).units.index.numItems).toBe(9 - 2 + 8);
    t.shattered.clear();
    t.version++;
    expect(select(t, at(3.5, 3.5), 0.1 * CELL)).toEqual([4]);
    expect(getIndexes(t).interior).toBeNull();
  });
});

describe('unitGeometry', () => {
  const topo = gridTopology();

  test('walks arc refs into a closed counter-clockwise lon/lat ring', () => {
    const g = unitGeometry(topo, topo.parents, 0);
    expect(g.coordinates.length).toBe(1);
    const [ring] = g.coordinates[0];
    // 8 arcs of 3 vertices, sharing endpoints, closed.
    expect(ring.length).toBe(17);
    expect(ring[0]).toEqual(ring[16]);
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    expect(area).toBeGreaterThan(0);
    const [lng, lat] = toLngLat(at(0, 0).x, at(0, 0).y);
    expect(ring.some(([x, y]) => Math.abs(x - lng) < 1e-9 && Math.abs(y - lat) < 1e-9)).toBe(true);
  });

  test('child rings mix exterior and interior arcs', () => {
    const chunk = topo.chunks.get(4)!.children;
    const [ring] = unitGeometry(topo, chunk, 0).coordinates[0];
    expect(ring.length).toBe(9);
    expect(ring[0]).toEqual(ring[8]);
  });
});

test('toLngLat inverts MercatorCoordinate.fromLngLat', () => {
  const m = MercatorCoordinate.fromLngLat({lng: -97.74, lat: 30.27});
  const [lng, lat] = toLngLat(m.x, m.y);
  expect(lng).toBeCloseTo(-97.74, 9);
  expect(lat).toBeCloseTo(30.27, 9);
});
