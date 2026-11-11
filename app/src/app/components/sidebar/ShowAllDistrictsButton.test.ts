import {afterEach, describe, expect, test} from 'bun:test';
import {filterPinnedRows, pinnedFilterLabel} from './ShowAllDistrictsButton';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';

const initialMapState = useMapStore.getState();

describe('pinned districts', () => {
  // bun shares module state across test files; don't leak pins or the fake map.
  afterEach(() => {
    useMapStore.setState(initialMapState);
    useMapControlsStore.setState({pinnedZones: [], showAllPinned: false});
  });

  test('filterPinnedRows keeps pinned districts and non-district rows', () => {
    const rows = [{zone: 1}, {zone: 2}, {zone: 3}, {zone: null}, {zone: 'Statewide'}];
    expect(filterPinnedRows(rows, [3])).toEqual([{zone: 3}, {zone: null}, {zone: 'Statewide'}]);
  });

  test('togglePinnedZone adds and removes', () => {
    const {togglePinnedZone} = useMapControlsStore.getState();
    togglePinnedZone(3);
    togglePinnedZone(7);
    togglePinnedZone(3);
    expect(useMapControlsStore.getState().pinnedZones).toEqual([7]);
  });

  test('pinnedFilterLabel lists the pins in order', () => {
    expect(pinnedFilterLabel([7, 3], false)).toBe('Showing pinned districts 3, 7');
    expect(pinnedFilterLabel([3], false)).toBe('Showing pinned district 3');
    expect(pinnedFilterLabel([7, 3], true)).toBe('Showing all districts (pinned: 3, 7)');
  });

  test('show all survives more pins and resets when pinning stops or starts', () => {
    const {togglePinnedZone, setShowAllPinned} = useMapControlsStore.getState();
    togglePinnedZone(3);
    setShowAllPinned(true);
    togglePinnedZone(7);
    expect(useMapControlsStore.getState().showAllPinned).toBe(true);
    togglePinnedZone(3);
    togglePinnedZone(7);
    expect(useMapControlsStore.getState().showAllPinned).toBe(false);
    togglePinnedZone(5);
    expect(useMapControlsStore.getState().showAllPinned).toBe(false);
  });

  test('clearPinnedZones unpins everything and drops show all', () => {
    useMapControlsStore.setState({pinnedZones: [3, 7], showAllPinned: true});
    useMapControlsStore.getState().clearPinnedZones();
    expect(useMapControlsStore.getState()).toMatchObject({pinnedZones: [], showAllPinned: false});
  });

  test('lowering the district count drops pins on removed districts', () => {
    useMapStore.setState({mapDocument: {num_districts: 5, color_scheme: []}} as any);
    useMapControlsStore.setState({pinnedZones: [1, 4, 5]});
    useMapStore.getState().setNumDistricts(3);
    expect(useMapControlsStore.getState().pinnedZones).toEqual([1]);
  });
});
