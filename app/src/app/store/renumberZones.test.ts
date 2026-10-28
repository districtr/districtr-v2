import {beforeEach, describe, expect, test} from 'bun:test';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {followZoneRenumber} from './temporalStore';
import {temporalManager} from '../utils/temporal';
import {MAP_MODES} from '@constants/map/mode';
import {moveZoneMapping} from '../utils/map/moveZone';

const swap12 = () =>
  new Map([
    [1, 2],
    [2, 1],
  ]);
const assignments = () => Object.fromEntries(useAssignmentsStore.getState().zoneAssignments);

// bun shares module state across test files, so start each test from a clean store.
beforeEach(() => {
  useAssignmentsStore.getState().resetZoneAssignments();
  useAssignmentsStore.setState({lastZoneRenumber: null, clientLastUpdated: ''});
  useMapStore.setState({mapLock: null});
  temporalManager.resume(MAP_MODES.DISTRICTS);
  useAssignmentsStore.temporal.getState().clear();
});

describe('renumberZones', () => {
  test('renumbers zones, metadata follows, undo restores both', () => {
    useMapStore.setState({
      mapDocument: {
        document_id: '',
        color_scheme: ['#111', '#222', '#333'],
        map_metadata: {zone_aliases: {'1': 'North'}},
        document_comments: [{zone: 2, text: 'south'}],
      } as any,
    });
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
      clientLastUpdated: '2020-01-01T00:00:00.000Z',
    });
    useMapControlsStore.setState(s => ({
      selectedZone: 1,
      mapOptions: {...s.mapOptions, lockPaintedAreas: [2]},
    }));
    const {renumberZones} = useAssignmentsStore.getState();
    // A merge isn't a permutation: ignored.
    renumberZones(new Map([[3, 2]]));
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(0);
    // A 3-cycle, so an un-inverted undo would show.
    renumberZones(
      new Map([
        [1, 2],
        [2, 3],
        [3, 1],
      ])
    );
    const state = () => ({
      zones: Array.from(useAssignmentsStore.getState().zoneAssignments.values()),
      colors: useMapStore.getState().mapDocument?.color_scheme,
      aliases: useMapStore.getState().mapDocument?.map_metadata.zone_aliases,
      comments: useMapStore.getState().mapDocument?.document_comments?.map(c => c.zone),
      selected: useMapControlsStore.getState().selectedZone,
      locks: useMapControlsStore.getState().mapOptions.lockPaintedAreas,
    });
    const renumbered = {
      zones: [2, 3, 1],
      colors: ['#333', '#111', '#222'],
      aliases: {'2': 'North'},
      comments: [3],
      selected: 2,
      locks: [3],
    };
    expect(state()).toEqual(renumbered);

    // An ordinary edit after the renumber: undoing it must leave the metadata alone.
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 2],
        ['b', 3],
        ['c', 3],
      ]),
      clientLastUpdated: '2020-01-02T00:00:00.000Z',
    });
    const {undo, redo} = useAssignmentsStore.temporal.getState();
    followZoneRenumber(undo, 'undo');
    expect(state()).toEqual(renumbered);

    followZoneRenumber(undo, 'undo');
    expect(state()).toEqual({
      zones: [1, 2, 3],
      colors: ['#111', '#222', '#333'],
      aliases: {'1': 'North'},
      comments: [2],
      selected: 1,
      locks: [2],
    });
    followZoneRenumber(redo, 'redo');
    expect(state()).toEqual(renumbered);
  });

  test('broken-down blocks follow a renumber right after a break; undo restores both', () => {
    useMapStore.setState({
      mapDocument: {
        document_id: '',
        color_scheme: ['#111', '#222'],
        map_metadata: {},
        document_comments: [],
      } as any,
    });
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 1],
        ['p', 2],
      ]),
      clientLastUpdated: '2020-01-01T00:00:00.000Z',
    });
    // handleShatter pauses tracking; the break's undo step folds into the next edit.
    temporalManager.pause(MAP_MODES.DISTRICTS);
    useAssignmentsStore.getState().setShatterState({
      shatterIds: {parents: new Set(['p']), children: new Set(['p1', 'p2'])},
      parentToChild: new Map([['p', new Set(['p1', 'p2'])]]),
      childToParent: new Map([
        ['p1', 'p'],
        ['p2', 'p'],
      ]),
      zoneAssignments: new Map([
        ['a', 1],
        ['p1', 2],
        ['p2', 2],
      ]),
    });
    useAssignmentsStore.getState().renumberZones(swap12());
    expect(assignments()).toEqual({a: 2, p1: 1, p2: 1});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#222', '#111']);

    followZoneRenumber(useAssignmentsStore.temporal.getState().undo, 'undo');
    expect(assignments()).toEqual({a: 1, p: 2});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#111', '#222']);
  });

  test('loading a server document clears undo history, whichever tab renumbered', () => {
    const doc = {
      document_id: '',
      color_scheme: ['#111', '#222'],
      map_metadata: {},
      document_comments: [],
    } as any;
    const serverData = {
      zoneAssignments: new Map([['a', 2]]),
      shatterIds: {parents: new Set<string>(), children: new Set<string>()},
      parentToChild: new Map(),
      childToParent: new Map(),
    };
    useMapStore.setState({mapDocument: doc});
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 1],
        ['b', 2],
      ]),
      clientLastUpdated: '2020-01-01T00:00:00.000Z',
    });
    // This tab renumbered.
    useAssignmentsStore.getState().renumberZones(swap12());
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(1);
    useAssignmentsStore
      .getState()
      .ingestFromDocument(serverData, {...doc, updated_at: '2020-02-01T00:00:00.000Z'});
    expect(useAssignmentsStore.getState().lastZoneRenumber).toBeNull();
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(0);

    // Only an ordinary edit here (the other tab renumbered): history still goes.
    useAssignmentsStore.setState({
      zoneAssignments: new Map([['a', 1]]),
      clientLastUpdated: '2020-03-01T00:00:00.000Z',
    });
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(1);
    useAssignmentsStore
      .getState()
      .ingestFromDocument(serverData, {...doc, updated_at: '2020-04-01T00:00:00.000Z'});
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(0);
  });
});

describe('setZoneAlias', () => {
  test('sanitizes, caps by code point, and deletes blank names', () => {
    useMapStore.setState({
      mapDocument: {document_id: '', map_metadata: {zone_aliases: {'2': 'Old'}}} as any,
    });
    const {setZoneAlias} = useMapStore.getState();
    const aliases = () => useMapStore.getState().mapDocument?.map_metadata.zone_aliases;
    setZoneAlias(1, ' North <b>Shore</b> ');
    setZoneAlias(2, '   ');
    expect(aliases()).toEqual({'1': 'North Shore'});
    // 39 letters then emoji: a UTF-16 slice at 40 would leave half an emoji.
    setZoneAlias(3, 'a'.repeat(39) + '😀😀');
    expect(aliases()?.['3']).toBe('a'.repeat(39) + '😀');
  });
});

describe('moveZoneMapping', () => {
  test('moves a district and shifts the ones in between', () => {
    expect(Object.fromEntries(moveZoneMapping(4, 2))).toEqual({4: 2, 2: 3, 3: 4});
    expect(Object.fromEntries(moveZoneMapping(1, 3))).toEqual({1: 3, 3: 2, 2: 1});
    expect(moveZoneMapping(2, 2).size).toBe(0);
  });
});
