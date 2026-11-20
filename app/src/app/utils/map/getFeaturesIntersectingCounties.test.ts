import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {getFeaturesIntersectingCounties} from './getFeaturesIntersectingCounties';
import {demographyService} from '../demography/demographyService';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useOverlayStore} from '@store/overlayStore';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';

// The brush is always over county 17031.
const map = {
  queryRenderedFeatures: () => [{properties: {STATEFP: '17', COUNTYFP: '031'}}],
} as any;
const brush = () => getFeaturesIntersectingCounties(map, {point: {x: 0, y: 0}} as any, 1);
const rows = (...ids: string[]) => ids.map(id => ({id}) as MapGeoJSONFeature);

// The brush's units pass through filterFeatures, which reads these stores;
// other suites leave locks, a broken unit or block view behind in them.
beforeEach(() => {
  useMapStore.setState({mapDocument: null, captiveIds: new Set()});
  useMapControlsStore.setState(state => ({
    mapMode: MAP_MODES.DISTRICTS,
    activeTool: ACTIVE_TOOLS.PAN,
    mapOptions: {...state.mapOptions, disallowPaintOver: false, lockPaintedAreas: []},
  }));
  useOverlayStore.setState({paintConstraint: null});
});

afterEach(() => {
  mock.restore();
  demographyService.hash = '';
});

describe('getFeaturesIntersectingCounties', () => {
  test("rereads the county's units once demography reloads after a heal", () => {
    // Broken: P's blocks are the county's units.
    demographyService.hash = 'broken';
    const getFiltered = spyOn(demographyService, 'getFiltered').mockImplementation(() =>
      rows('b1', 'b2')
    );
    expect(brush()?.map(f => f.id)).toEqual(['b1', 'b2']);

    // Healed: the reloaded table has P instead, and the next stroke must paint it.
    demographyService.hash = 'healed';
    getFiltered.mockImplementation(() => rows('P'));
    expect(brush()?.map(f => f.id)).toEqual(['P']);
  });
});
