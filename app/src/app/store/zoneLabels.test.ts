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
    useMapControlsStore.setState({selectedZone: 4, pinnedZones: [4]});

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
    expect(useMapControlsStore.getState().pinnedZones).toEqual([3]);
    // One IndexedDB write, carrying the new document and assignments.
    expect(writeAssignments).toHaveBeenCalledTimes(1);
    expect(writeIdb).not.toHaveBeenCalled();
  });

  test("lowering unassigns a broken-up unit's blocks; it doesn't drop them", () => {
    // Block b4 of a broken-up unit is in district 4, its sibling b1 in district 1.
    // Dropping b4's entry would leave the unit with only some of its blocks,
    // which the server refuses to save.
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['b1', 1],
        ['b4', 4],
        ['whole', 4],
      ]),
      shatterIds: {parents: new Set(['p']), children: new Set(['b1', 'b4'])},
    });
    useMapStore.getState().setNumDistricts(3);
    expect([...useAssignmentsStore.getState().zoneAssignments]).toEqual([
      ['b1', 1],
      ['b4', null],
    ]);
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

  test('colors follow the district, or stay on the rows', () => {
    const colors = ['#a', '#b', '#c', '#d'];
    useMapStore.setState({mapDocument: {...doc(), color_scheme: colors}});
    useMapStore.getState().setZoneOrder([4, 1, 2, 3]);
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(colors);

    useMapStore.setState({mapDocument: {...doc(), color_scheme: colors}});
    useMapStore.getState().setZoneOrder([4, 1, 2, 3], {colorsFollow: false});
    // Row 1 (now district 4) keeps the first color, and so on down the rows.
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(['#b', '#c', '#d', '#a']);
    expect(order()).toEqual([4, 1, 2, 3]);
    // From a custom order, too: dragging back restores the original colors.
    useMapStore.getState().setZoneOrder([1, 2, 3, 4], {colorsFollow: false});
    expect(useMapStore.getState().mapDocument?.color_scheme).toEqual(colors);
  });

  test('an unchanged order is not an edit', () => {
    useMapStore.getState().setZoneOrder([1, 2, 3, 4]);
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
  });
});
