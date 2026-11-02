/** Zone label placement in the geometry worker. Run with `bun test`. */
import {expect, test} from 'bun:test';
import GeometryWorker from './geometryWorker';

const pt = (path: string, x: number, y: number, total_pop_20 = 1000) => ({
  type: 'Feature' as const,
  geometry: {type: 'Point' as const, coordinates: [x, y]},
  properties: {path, total_pop_20},
});
const fc = (features: ReturnType<typeof pt>[]) => ({type: 'FeatureCollection' as const, features});
const labels = async (bounds: [number, number, number, number]) =>
  Object.fromEntries(
    (await GeometryWorker.getMedianPoint(bounds, [1, 2, 3])).centroids.features.map(f => [
      f.properties!.zone,
      f.geometry.coordinates,
    ])
  );

test('one label per zone, inside the view, sticky across pans', async () => {
  // Zone 1 is a 10x10 grid; zone 2 one point plus a low-pop one; zone 3 only blocks.
  const grid = Array.from({length: 100}, (_, i) => pt(`a${i}`, i % 10, Math.floor(i / 10)));
  GeometryWorker.clear();
  GeometryWorker.setPointData(fc([...grid, pt('b0', 20, 0, 10), pt('b1', 21, 0)]));
  GeometryWorker.setChildPointData(fc([pt('c0', 30, 0)]));
  GeometryWorker.updateZones([
    ...grid.map(f => [f.properties.path, 1] as [string, number]),
    ['b0', 2],
    ['b1', 2],
    ['c0', 3],
  ]);

  expect(await labels([-1, -1, 40, 10])).toEqual({1: [5, 5], 2: [21, 0], 3: [30, 0]});

  // Zoom in on zone 1's corner: the old label is out of view, so re-place inside it.
  const zoomed = await labels([0, 0, 3, 3]);
  expect(zoomed[1]).toEqual([2, 2]);
  expect(zoomed[2]).toBeUndefined();

  // Small pan: label stays put. Pan until it nears the edge: re-placed.
  expect((await labels([0.5, 0.5, 3.5, 3.5]))[1]).toEqual([2, 2]);
  expect((await labels([1.9, 1.9, 4.9, 4.9]))[1]).toEqual([3, 3]);

  // Zooming out re-centers a label placed at a closer zoom.
  expect((await labels([-2, -2, 8, 8]))[1]).toEqual([4, 4]);

  // Unassigning zones 2 and 3 drops their labels.
  GeometryWorker.updateZones(grid.map(f => [f.properties.path, 1] as [string, number]));
  expect(await labels([-1, -1, 40, 10])).toEqual({1: [5, 5]});
});

test('a repaint only re-places the zones it touched', async () => {
  // Two 10x2 blocks side by side: zone 1 at x 0..9, zone 2 at x 10..19.
  const pts = Array.from({length: 40}, (_, i) => pt(`p${i}`, i % 20, Math.floor(i / 20)));
  const zoneOf = (f: ReturnType<typeof pt>) => (f.geometry.coordinates[0] < 10 ? 1 : 2);
  GeometryWorker.clear();
  GeometryWorker.setPointData(fc(pts));
  GeometryWorker.setChildPointData(fc([]));
  GeometryWorker.updateZones(pts.map(f => [f.properties.path, zoneOf(f)] as [string, number]));
  expect(await labels([-1, -1, 20, 2])).toEqual({1: [5, 1], 2: [15, 1]});

  // Unassign zone 2's x=19 column, then pan: zone 1 keeps its label (a fresh
  // placement over this view would be [6, 1]); zone 2 re-places without that column.
  GeometryWorker.updateZones(
    pts
      .filter(f => f.geometry.coordinates[0] !== 19)
      .map(f => [f.properties.path, zoneOf(f)] as [string, number])
  );
  expect(await labels([2, -1, 22, 2.5])).toEqual({1: [5, 1], 2: [14, 1]});
});
