import {afterEach, describe, expect, mock, spyOn, test} from 'bun:test';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {getFeaturesIntersectingCounties} from './getFeaturesIntersectingCounties';
import {demographyService} from '../demography/demographyService';

// The brush is always over county 17031.
const map = {
  queryRenderedFeatures: () => [{properties: {STATEFP: '17', COUNTYFP: '031'}}],
} as any;
const brush = () => getFeaturesIntersectingCounties(map, {point: {x: 0, y: 0}} as any, 1);
const rows = (...ids: string[]) => ids.map(id => ({id}) as MapGeoJSONFeature);

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
