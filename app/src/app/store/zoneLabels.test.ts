import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useMapStore} from './mapStore';
import {useAssignmentsStore} from './assignmentsStore';
import {idb} from '../utils/idb/idb';
import {useMapControlsStore} from './mapControlsStore';
import {followZoneRenumber} from './temporalStore';
import {temporalManager} from '../utils/temporal';
import {MAP_MODES} from '@constants/map/mode';

const doc = (map_metadata: object = {}) =>
  ({document_id: 'd1', num_districts: 4, map_metadata, document_comments: []}) as any;
const aliases = () => useMapStore.getState().mapDocument?.map_metadata.zone_aliases;
const order = () => useMapStore.getState().mapDocument?.map_metadata.zone_order;
let writeIdb: ReturnType<typeof spyOn>;

beforeEach(() => {
  writeIdb = spyOn(idb, 'updateIdbDocumentMetadata').mockImplementation(async () => {});
  writeIdb.mockClear();
  useMapStore.setState({mapDocument: doc(), updated: {metadata: false, comments: false}});
  useAssignmentsStore.setState({clientLastUpdated: 'T0'});
});
afterEach(() => mock.restore());

describe('setZoneAlias', () => {
  test('stores a label as a local edit; the number itself is the default', () => {
    expect(useMapStore.getState().setZoneAlias(1, ' North <b>Shore</b> ')).toBeNull();
    expect(aliases()).toEqual({'1': 'North Shore'});
    expect(useMapStore.getState().updated.metadata).toBe(true);
    expect(writeIdb).toHaveBeenCalledTimes(1);
    expect(useAssignmentsStore.getState().clientLastUpdated).not.toBe('T0');

    // Blank, or the district's own number, goes back to the default.
    useMapStore.getState().setZoneAlias(1, '1');
    expect(aliases()).toEqual({});
  });

  test('a name that cleans up to the stored one is not an edit', () => {
    useMapStore.setState({mapDocument: doc({zone_aliases: {'1': 'North Shore'}})});
    expect(useMapStore.getState().setZoneAlias(1, 'North  Shore ')).toBeNull();
    // Nor is resetting a district that already shows its number.
    expect(useMapStore.getState().setZoneAlias(2, '2')).toBeNull();
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe('T0');
  });

  test('refuses a label another district shows, without changing anything', () => {
    const refusal = useMapStore.getState().setZoneAlias(1, '3');
    expect(refusal).toContain('3');
    expect(aliases()).toBeUndefined();
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
  });
});

describe('renumberToOrder', () => {
  test('numbers follow the new order, each district keeps its metadata, undo and redo replay it', () => {
    spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
    spyOn(idb, 'setZoneLocks').mockImplementation(async () => {});
    useMapStore.setState({
      mapLock: null,
      mapDocument: {
        ...doc({zone_aliases: {'3': 'North'}}),
        color_scheme: ['#111', '#222', '#333', '#444'],
        document_comments: [{zone: 3, text: 'north note'}],
      },
    });
    useAssignmentsStore.setState({
      lastZoneRenumber: null,
      zoneAssignments: new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['c1', 3],
        ['d', 4],
      ]),
    });
    useMapControlsStore.setState(s => ({
      selectedZone: 3,
      mapOptions: {...s.mapOptions, lockPaintedAreas: [3]},
    }));
    temporalManager.resume(MAP_MODES.DISTRICTS);
    useAssignmentsStore.temporal.getState().clear();

    const state = () => {
      const m = useMapStore.getState().mapDocument!;
      return {
        assignments: Object.fromEntries(useAssignmentsStore.getState().zoneAssignments),
        colors: m.color_scheme,
        aliases: m.map_metadata.zone_aliases,
        order: m.map_metadata.zone_order,
        notes: m.document_comments?.map(c => c.zone),
        selected: useMapControlsStore.getState().selectedZone,
        locks: useMapControlsStore.getState().mapOptions.lockPaintedAreas,
      };
    };
    const original = state();
    // Drag district 3 to the top: 3 -> 1, 1 -> 2, 2 -> 3.
    useMapStore.getState().renumberToOrder([3, 1, 2, 4]);
    const renumbered = {
      assignments: {a: 2, b: 3, c: 1, c1: 1, d: 4},
      colors: ['#333', '#111', '#222', '#444'],
      aliases: {'1': 'North'},
      order: [],
      notes: [1],
      selected: 1,
      locks: [1],
    };
    expect(state()).toEqual(renumbered);
    expect(useMapStore.getState().updated).toEqual({metadata: true, comments: true});

    // An ordinary edit after the renumber: undoing it leaves the metadata alone.
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 2],
        ['b', 2],
        ['c', 1],
        ['c1', 1],
        ['d', 4],
      ]),
      clientLastUpdated: '2030-01-01T00:00:00.000Z',
    });
    const {undo, redo} = useAssignmentsStore.temporal.getState();
    followZoneRenumber(undo, 'undo');
    expect(state()).toEqual(renumbered);

    followZoneRenumber(undo, 'undo');
    expect(state()).toEqual({...original, order: []});
    followZoneRenumber(redo, 'redo');
    expect(state()).toEqual(renumbered);
  });

  test('a renumber right after a break folds the break in; undo restores both', () => {
    spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
    spyOn(idb, 'setZoneLocks').mockImplementation(async () => {});
    useMapStore.setState({
      mapLock: null,
      mapDocument: {...doc(), num_districts: 2, color_scheme: ['#111', '#222']},
    });
    useAssignmentsStore.getState().resetShatterState();
    useAssignmentsStore.setState({
      lastZoneRenumber: null,
      zoneAssignments: new Map([
        ['a', 1],
        ['p', 2],
      ]),
      clientLastUpdated: '2020-01-01T00:00:00.000Z',
    });
    temporalManager.resume(MAP_MODES.DISTRICTS);
    useAssignmentsStore.temporal.getState().clear();
    // A renumber before the break, so the break's snapshot must carry its marker.
    // Edits are stamped to the millisecond, and history skips a repeated stamp.
    useMapStore.getState().renumberToOrder([2, 1]);
    Bun.sleepSync(2);
    useMapStore.getState().renumberToOrder([2, 1]);
    Bun.sleepSync(2);
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
    useMapStore.getState().renumberToOrder([2, 1]);
    const assignments = () => Object.fromEntries(useAssignmentsStore.getState().zoneAssignments);
    expect(assignments()).toEqual({a: 2, p1: 1, p2: 1});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#222', '#111']);

    const {undo} = useAssignmentsStore.temporal.getState();
    followZoneRenumber(undo, 'undo');
    expect(assignments()).toEqual({a: 1, p: 2});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#111', '#222']);
    // Back past the two earlier swaps: after the first one, then the start.
    followZoneRenumber(undo, 'undo');
    expect(assignments()).toEqual({a: 2, p: 1});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#222', '#111']);
    followZoneRenumber(undo, 'undo');
    expect(assignments()).toEqual({a: 1, p: 2});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#111', '#222']);
  });

  test('loading a server document clears the renumber undo history', () => {
    spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
    spyOn(idb, 'setZoneLocks').mockImplementation(async () => {});
    const serverDoc = {...doc(), num_districts: 2, color_scheme: ['#111', '#222']};
    useMapStore.setState({mapLock: null, mapDocument: serverDoc});
    useAssignmentsStore.getState().resetShatterState();
    useAssignmentsStore.setState({
      lastZoneRenumber: null,
      zoneAssignments: new Map([
        ['a', 1],
        ['b', 2],
      ]),
      clientLastUpdated: '2020-01-01T00:00:00.000Z',
    });
    temporalManager.resume(MAP_MODES.DISTRICTS);
    useAssignmentsStore.temporal.getState().clear();
    useMapStore.getState().renumberToOrder([2, 1]);
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(1);
    useAssignmentsStore.getState().ingestFromDocument(
      {
        zoneAssignments: new Map([['a', 1]]),
        shatterIds: {parents: new Set<string>(), children: new Set<string>()},
        parentToChild: new Map(),
        childToParent: new Map(),
      },
      {...serverDoc, updated_at: '2020-02-01T00:00:00.000Z'}
    );
    expect(useAssignmentsStore.getState().lastZoneRenumber).toBeNull();
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(0);
  });
});
