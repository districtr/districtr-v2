import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useMapStore} from './mapStore';
import {useAssignmentsStore} from './assignmentsStore';
import {idb} from '../utils/idb/idb';

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
  });

  test('an unchanged order is not an edit', () => {
    useMapStore.getState().setZoneOrder([1, 2, 3, 4]);
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(writeIdb).not.toHaveBeenCalled();
  });
});
