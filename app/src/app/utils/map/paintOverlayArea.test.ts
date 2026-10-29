import {afterEach, beforeEach, expect, mock, test} from 'bun:test';
import {classifyUnit, paintOverlayArea, toAreaShape} from './paintOverlayArea';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {inspectOverlayArea, pickRows} from './inspectOverlayArea';
import {demographyService} from '@utils/demography/demographyService';
import {table} from 'arquero';

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

// The edge unit's block rows, read on the side by an exact inspection.
let sideReads: string[][] = [];
mock.module('../api/apiHandlers/getDemography', () => ({
  getDemography: async ({brokenIds}: {brokenIds: string[]}) => {
    sideReads.push(brokenIds);
    return {
      columns: ['path', 'sourceLayer', 'total_pop_20'],
      results: {
        path: ['b:edge-a', 'b:edge-b'],
        sourceLayer: ['blocks-layer', 'blocks-layer'],
        total_pop_20: [5, 7],
      },
    };
  },
}));

const unit = (id: string, geometry: ReturnType<typeof square>) => ({id, geometry, properties: {}});
// The real breakUnits' edge fetch, for the undo-recorder test.
mock.module('../api/apiHandlers/getChildEdges', () => ({
  getChildEdges: async () => [
    {parent_path: 'p:edge', child_path: 'b:edge-a'},
    {parent_path: 'p:edge', child_path: 'b:edge-b'},
  ],
}));

let zoom = 10;
const map = {
  getZoom: () => zoom,
  once: () => {},
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
  sideReads = [];
  useTooltipStore.setState({areaReading: null});
  healed = [];
  broke = [];
  zoom = 10;
  // Districts mode explicitly: another file (assignmentIntegrity) can leave
  // 'coi' behind, and breakUnits pauses the mode's own undo recorder.
  useMapControlsStore.setState({mapMode: 'districts'});
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

const paintedIds = async () => {
  let painted: string[] = [];
  await paintOverlayArea(map, {id: 'sd-1'} as any, features => {
    painted = features.map(f => String(f.id)).sort();
  });
  return painted;
};

test('an already broken edge unit is not broken again; its inside blocks paint', async () => {
  useAssignmentsStore.setState({
    shatterIds: {parents: new Set(['p:edge']), children: new Set(['b:edge-a', 'b:edge-b'])},
    parentToChild: new Map([['p:edge', new Set(['b:edge-a', 'b:edge-b'])]]),
  });
  expect(await paintedIds()).toEqual(['b:edge-a', 'p:in']);
  expect(broke).toEqual([]);
});

test('without a block layer, edge units paint whole', async () => {
  useMapStore.setState({
    mapDocument: {...useMapStore.getState().mapDocument!, child_layer: null},
  } as any);
  expect(await paintedIds()).toEqual(['p:edge', 'p:in']);
  expect(broke).toEqual([]);
});

test('below the minimum zoom nothing paints and the user is told to zoom in', async () => {
  zoom = 5;
  expect(await paintedIds()).toEqual([]);
  expect(useMapStore.getState().notification?.id).toBe('paint-area-zoom');
});

test('the break pauses undo until the paint, and a click resumes it either way', async () => {
  // The real breakUnits (the stub above skips its undo-recorder pause).
  useMapStore.setState({
    breakUnits: initialMap.breakUnits,
    mapDocument: {...useMapStore.getState().mapDocument!, districtr_map_slug: 'al'},
  } as any);
  const temporal = () => useAssignmentsStore.temporal.getState();
  let trackingDuringPaint: boolean | null = null;
  await paintOverlayArea(map, {id: 'sd-1'} as any, () => {
    trackingDuringPaint = temporal().isTracking;
  });
  expect(trackingDuringPaint as boolean | null).toBe(false);
  // Nothing was ingested (the paint above is a no-op): the click still resumes it.
  expect(temporal().isTracking).toBe(true);
});

const reading = () => useTooltipStore.getState().areaReading;

test('inspecting an area roughly counts edge units by center, and breaks nothing', async () => {
  await inspectOverlayArea(map, {id: 'sd-1'} as any, false);
  // Locks don't matter for reading; the edge unit's center is on the outline.
  expect([...reading()!.ids].sort()).toEqual(['p:edge', 'p:in', 'p:locked']);
  expect(reading()).toMatchObject({exact: false, loading: false});
  expect(sideReads).toEqual([]);
  expect(broke).toEqual([]);
});

test("an exact inspection reads the edge unit's blocks on the side, by block center", async () => {
  await inspectOverlayArea(map, {id: 'sd-1'} as any, true);
  expect([...reading()!.ids].sort()).toEqual(['p:in', 'p:locked']);
  expect(reading()!.extraRows).toEqual({
    path: ['b:edge-a'],
    sourceLayer: ['blocks-layer'],
    total_pop_20: [5],
  });
  expect(sideReads).toEqual([['p:edge']]);
  expect(broke).toEqual([]);
});

test("an exact inspection uses an already broken unit's loaded blocks", async () => {
  useAssignmentsStore.setState({
    shatterIds: {parents: new Set(['p:edge']), children: new Set(['b:edge-a', 'b:edge-b'])},
    parentToChild: new Map([['p:edge', new Set(['b:edge-a', 'b:edge-b'])]]),
  });
  await inspectOverlayArea(map, {id: 'sd-1'} as any, true);
  expect([...reading()!.ids].sort()).toEqual(['b:edge-a', 'p:in', 'p:locked']);
  expect(reading()!.extraRows).toBeUndefined();
  expect(sideReads).toEqual([]);
});

test('a rough reading never replaces an exact one of the same area', async () => {
  await inspectOverlayArea(map, {id: 'sd-1'} as any, true);
  await inspectOverlayArea(map, {id: 'sd-1'} as any, false);
  expect(reading()!.exact).toBe(true);
});

test('summary stats add the side rows to the loaded ones', () => {
  const saved = {table: demographyService.table, columns: demographyService.availableColumns};
  demographyService.table = table({path: ['p:in', 'p:out'], total_pop_20: [10, 100]});
  demographyService.availableColumns = ['path', 'total_pop_20'] as any;
  const side = pickRows(
    {path: ['b:1', 'b:2'], sourceLayer: ['x', 'x'], total_pop_20: [5, 7]} as any,
    path => path === 'b:1'
  );
  const [sums] = demographyService.calculateSummaryStats(['p:in'], ['total_pop_20'], side);
  expect(sums.total_pop_20).toBe(15);
  demographyService.table = saved.table;
  demographyService.availableColumns = saved.columns;
});
