import {afterEach, beforeEach, expect, mock, test} from 'bun:test';
import {classifyUnit, paintOverlayArea, toAreaShape} from './paintOverlayArea';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

const square = (x: number, y: number, size: number) => ({
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
});
const area = toAreaShape([square(0, 0, 10)]);

test('classifies units as whole, break or skip against the area', () => {
  expect(classifyUnit({box: [1, 1, 2, 2], point: [1.5, 1.5]}, area)).toBe('whole');
  expect(classifyUnit({box: [9, 4, 11, 6], point: [10, 5]}, area)).toBe('break');
  expect(classifyUnit({box: [20, 20, 21, 21], point: [20.5, 20.5]}, area)).toBe('skip');
  // A small area inside one big unit: no corner or center inside, but the
  // area's outline is, so the unit breaks.
  const small = toAreaShape([square(4, 4, 1)]);
  expect(classifyUnit({box: [0, 0, 10, 10], point: [8, 8]}, small)).toBe('break');
});

// Parent units: "in" sits inside the area, "edge" straddles its right side,
// "out" is far away. "edge" breaks into blocks "edge-a" (inside) and "edge-b"
// (outside); "locked" is inside but in a locked district.
const pointData: Record<string, [number, number]> = {
  'p:in': [2, 2],
  'p:locked': [3, 7],
  'p:edge': [10, 5],
  'p:out': [30, 30],
  'b:edge-a': [9, 5],
  'b:edge-b': [11, 5],
};
mock.module('../api/apiHandlers/getPointSelectionData', () => ({
  getPointSelectionData: async ({filterIds}: {filterIds: Set<string>}) => ({
    type: 'FeatureCollection',
    features: [...filterIds]
      .filter(id => pointData[id])
      .map(path => ({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: pointData[path]},
        properties: {path, total_pop_20: 1, __sourceLayer: 'blocks-layer'},
      })),
  }),
}));

const unit = (id: string, geometry: ReturnType<typeof square>) => ({id, geometry, properties: {}});
const map = {
  getLayer: () => ({}),
  querySourceFeatures: (source: string) =>
    source === 'blocks'
      ? [
          unit('p:in', square(1, 1, 2)),
          unit('p:locked', square(2, 6, 2)),
          unit('p:edge', square(9, 4, 2)),
          unit('p:out', square(29, 29, 2)),
        ]
      : [{id: 'sd-1', geometry: square(0, 0, 10)}],
} as any;

const initialMap = useMapStore.getState();
const initialControls = useMapControlsStore.getState();
const initialAssignments = useAssignmentsStore.getState();
let healed: string[] = [];
let broke: string[][] = [];

beforeEach(() => {
  healed = [];
  broke = [];
  useMapStore.setState({
    mapLock: null,
    mapDocument: {
      document_id: 'doc',
      parent_layer: 'vtds',
      child_layer: 'blocks-layer',
      overlays: [{overlay_id: 'sd', name: 'School districts', layer_type: 'line'}],
    },
    breakUnits: async (geoids: string[]) => {
      broke.push(geoids);
      useAssignmentsStore.setState({
        shatterIds: {parents: new Set(geoids), children: new Set(['b:edge-a', 'b:edge-b'])},
        parentToChild: new Map([['p:edge', new Set(['b:edge-a', 'b:edge-b'])]]),
      });
      return [];
    },
  } as any);
  useMapControlsStore.getState().setMapOptions({paintBy: 'overlay:sd', lockPaintedAreas: [3]});
  useAssignmentsStore.setState({
    zoneAssignments: new Map([['p:locked', 3]]),
    healParentsIfAllChildrenInSameZone: (({_parentIds}: {_parentIds: Set<string>}) => {
      healed.push(..._parentIds);
    }) as any,
  });
});
afterEach(() => {
  useMapStore.setState(initialMap);
  useMapControlsStore.setState(initialControls);
  useAssignmentsStore.setState(initialAssignments);
});

test('a click paints inside units whole and edge units by block center, then heals', async () => {
  let painted: string[] = [];
  await paintOverlayArea(map, {id: 'sd-1'} as any, features => {
    painted = features.map(f => String(f.id)).sort();
  });
  // Only the straddling unit is broken; the locked unit is filtered out.
  expect(broke).toEqual([['p:edge']]);
  expect(painted).toEqual(['b:edge-a', 'p:in']);
  expect(healed).toEqual(['p:edge']);
  expect(useMapStore.getState().mapLock).toBeNull();
});
