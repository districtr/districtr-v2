import {afterEach, beforeEach, expect, test} from 'bun:test';
import {getFeaturesInOverlayAreas, resetOverlayAreaCache} from './getFeaturesInOverlayAreas';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

const square = (x: number, y: number, size: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

// One overlay area (numeric id, as promoteId keeps it) with a unit inside and one outside.
const area = {id: 7, geometry: square(0, 0, 10)};
const inside = () => ({id: 'vtd:in', properties: {total_pop_20: '10'}, geometry: square(1, 1, 2)});
const outside = () => ({id: 'vtd:out', properties: {}, geometry: square(20, 20, 2)});

let unitQueries = 0;
let bounds = [0, 0, 30, 30];
const map = {
  getLayer: () => ({}),
  getZoom: () => 10,
  getBounds: () => ({toArray: () => [bounds.slice(0, 2), bounds.slice(2)]}),
  queryRenderedFeatures: () => [{id: 7}],
  querySourceFeatures: (source: string) => {
    if (source === 'blocks') {
      unitQueries++;
      return [inside(), outside()];
    }
    return [area];
  },
} as any;
const paint = () => getFeaturesInOverlayAreas(map, {point: {x: 0, y: 0}} as any, 1);

const initialMap = useMapStore.getState();
const initialControls = useMapControlsStore.getState();
const initialAssignments = useAssignmentsStore.getState();
beforeEach(() => {
  resetOverlayAreaCache();
  unitQueries = 0;
  bounds = [0, 0, 30, 30];
  useMapStore.setState({
    captiveIds: new Set<string>(),
    mapDocument: {
      document_id: 'doc',
      parent_layer: 'vtds',
      child_layer: null,
      overlays: [{overlay_id: 'sd', name: 'School districts', layer_type: 'line'}],
    },
  } as any);
  useMapControlsStore.getState().setMapOptions({paintBy: 'overlay:sd'});
});
afterEach(() => {
  useMapStore.setState(initialMap);
  useMapControlsStore.setState(initialControls);
  useAssignmentsStore.setState(initialAssignments);
});

test('paints the units inside the area under the brush, numeric area ids included', () => {
  expect(paint()?.map(f => f.id)).toEqual(['vtd:in']);
  expect(paint()?.[0].sourceLayer).toBe('vtds');
});

test('caches per area, and drops the cache after a break/heal or a pan', () => {
  paint();
  paint();
  expect(unitQueries).toBe(1);

  // Breaking or healing swaps the shatterIds object: a stale list could assign
  // both a parent and its blocks.
  const {shatterIds} = useAssignmentsStore.getState();
  useAssignmentsStore.setState({shatterIds: {...shatterIds}});
  paint();
  expect(unitQueries).toBe(2);

  // A pan loads more tiles, so more of the area's units.
  bounds = [5, 5, 35, 35];
  paint();
  expect(unitQueries).toBe(3);
});
