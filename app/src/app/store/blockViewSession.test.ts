import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useMapStore} from './mapStore';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapControlsStore} from './mapControlsStore';
import {idb} from '../utils/idb/idb';
import {demographyService} from '../utils/demography/demographyService';
import {temporalManager} from '../utils/temporal';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

// Two broken units: A's blocks share district 1, B's are split 1/2.
const parentToChild = () =>
  new Map([
    ['A', new Set(['a1', 'a2'])],
    ['B', new Set(['b1', 'b2'])],
  ]);
const childToParent = () =>
  new Map([
    ['a1', 'A'],
    ['a2', 'A'],
    ['b1', 'B'],
    ['b2', 'B'],
  ]);
const zones = () =>
  new Map<string, number | null>([
    ['a1', 1],
    ['a2', 1],
    ['b1', 1],
    ['b2', 2],
  ]);
// A straddles a tile boundary: one feature per tile.
const square = (x0: number, x1: number) => ({
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [x0, 0],
        [x1, 0],
        [x1, 1],
        [x0, 0],
      ],
    ],
  },
});
const fakeMap = {
  setFeatureState: () => {},
  querySourceFeatures: (_: string, {sourceLayer, filter}: any) => {
    const ids: string[] = filter[2][1];
    if (sourceLayer !== 'parents') return [];
    return [
      ...(ids.includes('A') ? [square(0, 1), square(1, 2)] : []),
      ...(ids.includes('B') ? [square(2, 3)] : []),
    ];
  },
};
const broken = () => useAssignmentsStore.getState().shatterIds.parents;
const history = () => useAssignmentsStore.temporal.getState().pastStates;

beforeEach(() => {
  spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
  spyOn(demographyService, 'updatePopulations').mockImplementation(() => true);
  useMapStore.setState({
    mapDocument: {
      document_id: 'd1',
      parent_layer: 'parents',
      child_layer: 'blocks',
      districtr_map_slug: 'm',
    } as any,
    getMapRef: () => fakeMap as any,
    captiveIds: new Set(),
    focusFeatures: [],
    mapLock: null,
  });
  useMapControlsStore.setState({mapMode: MAP_MODES.DISTRICTS, activeTool: ACTIVE_TOOLS.ERASER});
  useAssignmentsStore.setState({
    zoneAssignments: zones(),
    accumulatedAssignments: new Map(),
    shatterIds: {parents: new Set(['A', 'B']), children: new Set(['a1', 'a2', 'b1', 'b2'])},
    parentToChild: parentToChild(),
    childToParent: childToParent(),
    clientLastUpdated: 'T0',
    pendingShatterUndoState: null,
  });
  temporalManager.resume(MAP_MODES.DISTRICTS);
  temporalManager.clear(MAP_MODES.DISTRICTS);
});
afterEach(() => {
  // Leave no session behind for the next test.
  useMapStore.getState().exitBlockView();
  mock.restore();
});

const paint = (id: string, zone: number) => {
  useAssignmentsStore.setState({accumulatedAssignments: new Map([[id, zone]])});
  useAssignmentsStore.getState().ingestAccumulatedAssignments();
};

describe('enterBlockView', () => {
  test('reopens a broken unit around all of its tile pieces, keeping the tool', async () => {
    await useMapStore.getState().enterBlockView('A');
    const {captiveIds, focusFeatures} = useMapStore.getState();
    expect([...captiveIds]).toEqual(['a1', 'a2']);
    expect(focusFeatures[0].id).toBe('A');
    const {mapOptions, activeTool} = useMapControlsStore.getState();
    expect(mapOptions.mode).toBe('break');
    // Both pieces (x 0..2), padded by 30%.
    expect(mapOptions.bounds).toEqual([-0.6, -0.3, 2.6, 1.3]);
    expect(activeTool).toBe(ACTIVE_TOOLS.ERASER);
  });

  test('ignores a unit that is not broken', async () => {
    await useMapStore.getState().enterBlockView('C');
    expect(useMapStore.getState().captiveIds.size).toBe(0);
  });
});

describe('a block view session', () => {
  test('jumping leaves units broken; exiting heals every uniform one opened', async () => {
    await useMapStore.getState().enterBlockView('A');
    await useMapStore.getState().enterBlockView('B');
    expect(broken().has('A')).toBe(true);

    useMapStore.getState().exitBlockView();
    expect(useMapStore.getState().captiveIds.size).toBe(0);
    expect(broken().has('A')).toBe(false);
    expect(useAssignmentsStore.getState().zoneAssignments.get('A')).toBe(1);
    // B's blocks still disagree.
    expect(broken().has('B')).toBe(true);
  });

  test('each paint is one undo step and the exit heal folds into it', async () => {
    await useMapStore.getState().enterBlockView('B');
    paint('b2', 1);
    await useMapStore.getState().enterBlockView('A');
    useMapStore.getState().exitBlockView();
    expect(broken().size).toBe(0);
    expect(history().length).toBe(1);

    useAssignmentsStore.temporal.getState().undo();
    expect([...broken()].sort()).toEqual(['A', 'B']);
    expect(useAssignmentsStore.getState().zoneAssignments.get('b2')).toBe(2);
    useAssignmentsStore.temporal.getState().redo();
    expect(broken().size).toBe(0);
  });

  test('breaking again before painting keeps the first pre-break snapshot', () => {
    const {setShatterState} = useAssignmentsStore.getState();
    const before = useAssignmentsStore.getState().zoneAssignments;
    setShatterState({
      shatterIds: {parents: new Set(['A', 'B', 'C']), children: new Set()},
      parentToChild: parentToChild().set('C', new Set(['c1'])),
      childToParent: childToParent().set('c1', 'C'),
      zoneAssignments: zones(),
    });
    setShatterState({
      shatterIds: {parents: new Set(['A', 'B', 'C', 'D']), children: new Set()},
      parentToChild: parentToChild()
        .set('C', new Set(['c1']))
        .set('D', new Set(['d1'])),
      childToParent: childToParent().set('c1', 'C').set('d1', 'D'),
      zoneAssignments: zones(),
    });
    const pending = useAssignmentsStore.getState().pendingShatterUndoState!;
    expect([...pending.shatterIds.parents].sort()).toEqual(['A', 'B']);
    expect(pending.zoneAssignments).toEqual(before);
  });
});
