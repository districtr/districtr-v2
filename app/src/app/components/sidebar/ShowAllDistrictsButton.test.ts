import {afterEach, describe, expect, test} from 'bun:test';
import {
  applyFocusFilter,
  filterFocusedRows,
  focusFilterLabel,
  focusFiltering,
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

  test('focusFilterLabel lists the focused districts in order', () => {
    expect(focusFilterLabel([7, 3], false)).toBe('Focused: 3, 7');
    expect(focusFilterLabel([7, 3], true)).toBe('Showing focused districts 3, 7');
    expect(focusFilterLabel([3], true)).toBe('Showing focused district 3');
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
