import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useMapStore} from './mapStore';
import {useAssignmentsStore} from './assignmentsStore';
import {idb} from '../utils/idb/idb';
import {useMapControlsStore} from './mapControlsStore';

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

describe('setZoneOrder', () => {
  test('stores the panel order as a local edit and leaves labels alone', () => {
    useMapStore.setState({mapDocument: doc({zone_aliases: {'2': 'B'}})});
    useMapStore.getState().setZoneOrder([4, 1, 2, 3]);
    expect(order()).toEqual([4, 1, 2, 3]);
    expect(aliases()).toEqual({'2': 'B'});
    expect(useMapStore.getState().updated.metadata).toBe(true);
    expect(writeIdb).toHaveBeenCalledTimes(1);
  });

  test('an unchanged order is not an edit', () => {
    useMapStore.getState().setZoneOrder([1, 2, 3, 4]);
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
  });
});

describe('renumberToPanelOrder', () => {
  test('numbers follow the panel order; each district keeps its color, label and note', () => {
    spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
    spyOn(idb, 'setZoneLocks').mockImplementation(async () => {});
    useMapStore.setState({
      mapLock: null,
      mapDocument: {
        ...doc({zone_aliases: {'3': 'North'}, zone_order: [3, 1, 2, 4]}),
        color_scheme: ['#111', '#222', '#333', '#444'],
        document_comments: [{zone: 3, text: 'north note'}],
      },
    });
    useAssignmentsStore.setState({
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
    useAssignmentsStore.temporal.getState().clear();
    useAssignmentsStore.setState({clientLastUpdated: 'T1'}); // an undoable step to clear
    useMapStore.getState().renumberToPanelOrder();

    const m = useMapStore.getState().mapDocument!;
    expect(Object.fromEntries(useAssignmentsStore.getState().zoneAssignments)).toEqual({
      a: 2,
      b: 3,
      c: 1,
      c1: 1,
      d: 4,
    });
    expect(m.color_scheme).toEqual(['#333', '#111', '#222', '#444']);
    expect(m.map_metadata.zone_aliases).toEqual({'1': 'North'});
    expect(m.map_metadata.zone_order).toEqual([]);
    expect(m.document_comments?.map(c => c.zone)).toEqual([1]);
    expect(useMapControlsStore.getState().selectedZone).toBe(1);
    expect(useMapControlsStore.getState().mapOptions.lockPaintedAreas).toEqual([1]);
    expect(useMapStore.getState().updated).toEqual({metadata: true, comments: true});
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(0);
  });
});
