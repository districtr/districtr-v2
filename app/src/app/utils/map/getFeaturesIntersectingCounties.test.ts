/**
 * The county-brush memo must not outlive the store state filterFeatures reads:
 * a VTD shattered after the brush settled over its county must stop being
 * paintable without the brush leaving the county. Run with `bun test`.
 */
import {expect, mock, test} from 'bun:test';
import type {MapGeoJSONFeature, Map as MaplibreMap, MapLayerMouseEvent} from 'maplibre-gl';
import {getFeaturesIntersectingCounties} from './getFeaturesIntersectingCounties';
import {demographyService} from '../demography/demographyService';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapStore} from '@/app/store/mapStore';

test('memo invalidates when shatterIds change', () => {
  const vtd = {id: '17031vtd1', properties: {}} as unknown as MapGeoJSONFeature;
  demographyService.getFiltered = mock(() => [vtd]);
  useMapStore.setState({mapDocument: {child_layer: 'blocks'} as never});
  const map = {
    queryRenderedFeatures: () => [{properties: {STATEFP: '17', COUNTYFP: '031'}}],
  } as unknown as MaplibreMap;
  const e = {point: {x: 0, y: 0}} as MapLayerMouseEvent;

  expect(getFeaturesIntersectingCounties(map, e, 10)).toEqual([vtd]);

  useAssignmentsStore.setState({
    shatterIds: {parents: new Set([vtd.id as string]), children: new Set()},
  });
  expect(getFeaturesIntersectingCounties(map, e, 10)).toEqual([]);
});
