import {afterEach, describe, expect, test} from 'bun:test';
import {
  applyFocusFilter,
  filterFocusedRows,
  focusFilterLabel,
  focusFiltering,
  focusedFirst,
  MAX_PINNED_ROWS,
  pinnedRowCount,
} from './ShowAllDistrictsButton';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';

const initialMapState = useMapStore.getState();

describe('focused districts', () => {
  // bun shares module state across test files; don't leak focus or the fake map.
  afterEach(() => {
    useMapStore.setState(initialMapState);
    useMapControlsStore.setState({focusedZones: [], showFocusedOnly: false});
  });

  test('filterFocusedRows keeps focused districts and non-district rows', () => {
    const rows = [{zone: 1}, {zone: 2}, {zone: 3}, {zone: null}, {zone: 'Statewide'}];
    expect(filterFocusedRows(rows, [3])).toEqual([{zone: 3}, {zone: null}, {zone: 'Statewide'}]);
  });

  test('tables narrow to focused districts only with Show focused districts on', () => {
    const rows = [{zone: 1}, {zone: 2}, {zone: 3}];
    expect(focusFiltering([3], false)).toBe(false);
    expect(applyFocusFilter(rows, [3], false)).toEqual(rows);
    expect(focusFiltering([3], true)).toBe(true);
    expect(applyFocusFilter(rows, [3], true)).toEqual([{zone: 3}]);
    // A leftover focused-only flag with nothing focused shows everything.
    expect(focusFiltering([], true)).toBe(false);
    expect(applyFocusFilter(rows, [], true)).toEqual(rows);
  });

  test('toggleFocusedZone adds and removes', () => {
    const {toggleFocusedZone} = useMapControlsStore.getState();
    toggleFocusedZone(3);
    toggleFocusedZone(7);
    toggleFocusedZone(3);
    expect(useMapControlsStore.getState().focusedZones).toEqual([7]);
  });

  test('focusedFirst moves focused rows to the front, each group in its order', () => {
    const rows = [{zone: 1}, {zone: 2}, {zone: 3}, {zone: 4}];
    expect(focusedFirst(rows, [4, 2])).toEqual([{zone: 2}, {zone: 4}, {zone: 1}, {zone: 3}]);
    expect(focusedFirst(rows, [])).toEqual(rows);
  });

  test('pinnedRowCount pins focused rows up to the cap, and only over other rows', () => {
    expect(pinnedRowCount(0, 20)).toBe(0);
    expect(pinnedRowCount(2, 20)).toBe(2);
    expect(pinnedRowCount(MAX_PINNED_ROWS, 20)).toBe(MAX_PINNED_ROWS);
    expect(pinnedRowCount(MAX_PINNED_ROWS + 1, 20)).toBe(0);
    // Every row focused (Show focused districts): nothing scrolls beneath.
    expect(pinnedRowCount(3, 3)).toBe(0);
  });

  test('focusFilterLabel lists the focused districts by label', () => {
    expect(focusFilterLabel(['North', '7'], false)).toBe('Focused: North, 7');
    expect(focusFilterLabel(['North', '7'], true)).toBe('Showing focused districts North, 7');
    expect(focusFilterLabel(['North'], true)).toBe('Showing focused district North');
  });

  test('focusing leaves focused-only off; focused-only survives more focus and resets at none', () => {
    const {toggleFocusedZone, setShowFocusedOnly} = useMapControlsStore.getState();
    toggleFocusedZone(3);
    expect(useMapControlsStore.getState().showFocusedOnly).toBe(false);
    setShowFocusedOnly(true);
    toggleFocusedZone(7);
    expect(useMapControlsStore.getState().showFocusedOnly).toBe(true);
    toggleFocusedZone(3);
    toggleFocusedZone(7);
    expect(useMapControlsStore.getState().showFocusedOnly).toBe(false);
    toggleFocusedZone(5);
    expect(useMapControlsStore.getState().showFocusedOnly).toBe(false);
  });

  test('clearFocusedZones clears focus and drops focused-only', () => {
    useMapControlsStore.setState({focusedZones: [3, 7], showFocusedOnly: true});
    useMapControlsStore.getState().clearFocusedZones();
    expect(useMapControlsStore.getState()).toMatchObject({
      focusedZones: [],
      showFocusedOnly: false,
    });
  });

  test('lowering the district count drops focus on removed districts', () => {
    useMapStore.setState({mapDocument: {num_districts: 5, color_scheme: []}} as any);
    useMapControlsStore.setState({focusedZones: [1, 4, 5]});
    useMapStore.getState().setNumDistricts(3);
    expect(useMapControlsStore.getState().focusedZones).toEqual([1]);
  });
});
