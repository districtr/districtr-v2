import {afterEach, describe, expect, test} from 'bun:test';
import {filterPinnedRows} from './ShowAllDistrictsButton';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';

const initialMapState = useMapStore.getState();

describe('pinned districts', () => {
  // bun shares module state across test files; don't leak pins or the fake map.
  afterEach(() => {
    useMapStore.setState(initialMapState);
    useMapControlsStore.getState().clearPinnedZones();
  });

  test('filterPinnedRows keeps pinned districts and non-district rows', () => {
    const rows = [{zone: 1}, {zone: 2}, {zone: 3}, {zone: null}, {zone: 'Statewide'}];
    expect(filterPinnedRows(rows, [3])).toEqual([{zone: 3}, {zone: null}, {zone: 'Statewide'}]);
  });

  test('togglePinnedZone adds and removes; clearPinnedZones empties', () => {
    const {togglePinnedZone, clearPinnedZones} = useMapControlsStore.getState();
    togglePinnedZone(3);
    togglePinnedZone(7);
    togglePinnedZone(3);
    expect(useMapControlsStore.getState().pinnedZones).toEqual([7]);
    clearPinnedZones();
    expect(useMapControlsStore.getState().pinnedZones).toEqual([]);
  });

  test('lowering the district count drops pins on removed districts', () => {
    useMapStore.setState({mapDocument: {num_districts: 5, color_scheme: []}} as any);
    useMapControlsStore.setState({pinnedZones: [1, 4, 5]});
    useMapStore.getState().setNumDistricts(3);
    expect(useMapControlsStore.getState().pinnedZones).toEqual([1]);
  });
});
