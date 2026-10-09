/** Topology arc decoding: delta int32 -> lon/lat -> MapLibre mercator. Run with `bun test`. */
import {describe, expect, test} from 'bun:test';
import {MercatorCoordinate} from 'maplibre-gl';
import {decodeArcs, latOfMercY, lonOfMercX, mercX, mercY} from './decode';

describe('decodeArcs', () => {
  // Two arcs, lon/lat x 1e6, first vertex absolute and the rest deltas.
  const columns = {
    xs: [
      [-97_811_170, -594, 600],
      [10, 5],
    ],
    ys: [
      [30_103_777, -1_236, 1_000],
      [-20, 0],
    ],
    xmin: [-97_811_764, 10],
    ymin: [30_102_541, -20],
    xmax: [-97_811_164, 15],
    ymax: [30_103_777, -20],
    length_m: [1.5, 2.5],
    a_parent: [0, 3],
    b_parent: [1, -1],
    a_child: [4, 7],
    b_child: [5, -1],
  };
  const arcs = decodeArcs(columns, 0, 2, 0);

  test('undoes the deltas and projects like MapLibre', () => {
    const lonlat = [
      [-97.81117, 30.103777],
      [-97.811764, 30.102541],
      [-97.811164, 30.103541],
      [0.00001, -0.00002],
      [0.000015, -0.00002],
    ];
    expect(Array.from(arcs.offsets)).toEqual([0, 3, 5]);
    lonlat.forEach(([lon, lat], v) => {
      const m = MercatorCoordinate.fromLngLat([lon, lat]);
      expect(arcs.coords[2 * v]).toBeCloseTo(m.x, 15);
      expect(arcs.coords[2 * v + 1]).toBeCloseTo(m.y, 15);
    });
  });

  test('bbox is min/max in mercator, so lat max becomes y min', () => {
    expect(arcs.bbox[1]).toBe(mercY(30.103777));
    expect(arcs.bbox[3]).toBe(mercY(30.102541));
    expect(arcs.bbox[1]).toBeLessThan(arcs.bbox[3]);
  });

  test('interior chunks use the owning parent on both sides', () => {
    const interior = decodeArcs(columns, 1, 2, 100, 9);
    expect(interior.firstArc).toBe(100);
    expect(Array.from(interior.aParent)).toEqual([9]);
    expect(Array.from(interior.bParent)).toEqual([9]);
    expect(Array.from(interior.aChild)).toEqual([7]);
  });

  test('binary xy decodes like the lists', () => {
    const blob = (xs: number[], ys: number[]) => {
      const view = new DataView(new ArrayBuffer(8 * xs.length));
      xs.forEach((x, i) => {
        view.setInt32(8 * i, x, true);
        view.setInt32(8 * i + 4, ys[i], true);
      });
      return new Uint8Array(view.buffer);
    };
    const {xs, ys, ...rest} = columns;
    const fromBlob = decodeArcs({...rest, xy: xs.map((x, k) => blob(x, ys[k]))}, 0, 2, 0);
    expect(fromBlob.coords).toEqual(arcs.coords);
    expect(fromBlob.offsets).toEqual(arcs.offsets);
  });

  test('inverse projection round-trips', () => {
    expect(lonOfMercX(mercX(-97.81117))).toBeCloseTo(-97.81117, 12);
    expect(latOfMercY(mercY(30.103777))).toBeCloseTo(30.103777, 12);
  });
});
