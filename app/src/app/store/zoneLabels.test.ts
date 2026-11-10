import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useMapStore} from './mapStore';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapControlsStore} from './mapControlsStore';
import {idb} from '../utils/idb/idb';

const doc = (map_metadata: object = {}) =>
  ({document_id: 'd1', num_districts: 4, map_metadata, document_comments: []}) as any;
const aliases = () => useMapStore.getState().mapDocument?.map_metadata.zone_aliases;
const order = () => useMapStore.getState().mapDocument?.map_metadata.zone_order;
let writeIdb: ReturnType<typeof spyOn>;
let writeAssignments: ReturnType<typeof spyOn>;

beforeEach(() => {
  writeIdb = spyOn(idb, 'updateIdbDocumentMetadata').mockImplementation(async () => {});
  writeIdb.mockClear();
  writeAssignments = spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
  writeAssignments.mockClear();
  useMapStore.setState({mapDocument: doc(), updated: {metadata: false, comments: false}});
  useAssignmentsStore.setState({clientLastUpdated: 'T0'});
});
afterEach(() => mock.restore());

describe('setZoneAlias', () => {
  test('stores a label as a local edit; the number itself is the default', () => {
    useMapStore.getState().setZoneAlias(1, ' North <b>Shore</b> ');
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
    useMapStore.getState().setZoneAlias(1, 'North  Shore ');
    // Nor is resetting a district that already shows its number.
    useMapStore.getState().setZoneAlias(2, '2');
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe('T0');
  });

  test('a label another district shows gets the next free suffix', () => {
    useMapStore.getState().setZoneAlias(1, '3');
    expect(aliases()).toEqual({'1': '3_2'});
    useMapStore.getState().setZoneAlias(2, '3');
    expect(aliases()).toEqual({'1': '3_2', '2': '3_3'});
    expect(useMapStore.getState().updated.metadata).toBe(true);
  });
});

describe('setNumDistricts', () => {
  test('keeps labels unique and drops labels for removed districts', () => {
    // District 1 is labeled "5": a new district 5 can't default to "5".
    useMapStore.setState({mapDocument: doc({zone_aliases: {'1': '5'}})});
    useMapStore.getState().setNumDistricts(5);
    expect(aliases()).toEqual({'1': '5', '5': '1'});
    useMapStore.getState().setNumDistricts(4);
    expect(aliases()).toEqual({'1': '5'});
  });

  test("lowering removes the panel's last rows, which swap numbers with kept ones", () => {
    // District 3 ("South") is the last row; district 4 ("North") is kept.
    useMapStore.setState({
      mapDocument: {
        ...doc({zone_aliases: {'3': 'South', '4': 'North'}, zone_order: [4, 1, 2, 3]}),
        color_scheme: ['#a', '#b', '#c', '#d'],
        document_comments: [{zone: 4, text: 'north'}],
      },
    });
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['s', 3],
        ['n', 4],
        ['o', 1],
      ]),
    });
    useMapControlsStore.setState({selectedZone: 4, focusedZones: [4]});

    useMapStore.getState().setNumDistricts(3);
    const {mapDocument} = useMapStore.getState();
    expect(aliases()).toEqual({'3': 'North'});
    expect(order()).toEqual([3, 1, 2, 4]);
    expect(mapDocument?.color_scheme?.slice(0, 3)).toEqual(['#a', '#b', '#d']);
    expect(mapDocument?.document_comments).toEqual([{zone: 3, text: 'north'}]);
    expect([...useAssignmentsStore.getState().zoneAssignments]).toEqual([
      ['n', 3],
      ['o', 1],
    ]);
    expect(useMapControlsStore.getState().selectedZone).toBe(3);
    expect(useMapControlsStore.getState().focusedZones).toEqual([3]);
    // One IndexedDB write, carrying the new document and assignments.
    expect(writeAssignments).toHaveBeenCalledTimes(1);
    expect(writeIdb).not.toHaveBeenCalled();
  });
});

describe('reorderZones', () => {
  test('renumbers districts to their rows; colors stay, labels and the rest move', () => {
    useMapStore.setState({
      mapDocument: {
        ...doc({zone_aliases: {'4': 'North'}}),
        color_scheme: ['#a', '#b', '#c', '#d'],
        document_comments: [{zone: 4, text: 'north'}],
      },
    });
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['n', 4],
        ['o', 1],
      ]),
    });
    useMapControlsStore.setState({selectedZone: 4, focusedZones: [4]});

    // District 4 moves to the top row.
    useMapStore.getState().reorderZones([4, 1, 2, 3]);
    const {mapDocument, updated} = useMapStore.getState();
    expect(aliases()).toEqual({'1': 'North'});
    expect(order()).toBeNull();
    expect(mapDocument?.color_scheme).toEqual(['#a', '#b', '#c', '#d']);
    expect(mapDocument?.document_comments).toEqual([{zone: 1, text: 'north'}]);
    expect([...useAssignmentsStore.getState().zoneAssignments]).toEqual([
      ['n', 1],
      ['o', 2],
    ]);
    expect(useMapControlsStore.getState().selectedZone).toBe(1);
    expect(useMapControlsStore.getState().focusedZones).toEqual([1]);
    expect(updated).toEqual({metadata: true, comments: true});
    expect(writeAssignments).toHaveBeenCalledTimes(1);
  });

  test('a saved panel order keeps its row colors when renumbered', () => {
    useMapStore.setState({
      mapDocument: {...doc({zone_order: [3, 1, 2, 4]}), color_scheme: ['#a', '#b', '#c', '#d']},
    });
    // Unchanged rows: district 3 (row 1, showing #c) becomes district 1.
    useMapStore.getState().reorderZones([3, 1, 2, 4]);
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#c', '#a', '#b', '#d']);
    expect(order()).toBeNull();
  });

  test('a district left showing a number another uses as its label gets a free one', () => {
    // District 1 is labeled "2"; district 2 is labeled "B".
    useMapStore.setState({mapDocument: doc({zone_aliases: {'1': '2', '2': 'B'}})});
    // Unlabeled district 3 moves to row 2 and would show "2" as well.
    useMapStore.getState().reorderZones([1, 3, 2, 4]);
    expect(aliases()).toEqual({'1': '2', '2': '1', '3': 'B'});
  });

  test('an unchanged order is not an edit', () => {
    useMapStore.getState().reorderZones([1, 2, 3, 4]);
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
  });
});
