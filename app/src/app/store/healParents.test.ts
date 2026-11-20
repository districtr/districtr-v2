import {beforeEach, describe, expect, test} from 'bun:test';
import type * as maplibregl from 'maplibre-gl';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {MapRenderSubscriber} from '../utils/map/mapRenderSubs';
import {MAP_MODES} from '@constants/map/mode';
import {APP_LOADING_STATES} from '@constants/document/state';
import {RENDERING_STATES} from '@constants/map/renderingState';

type FeatureStateCall = [{id?: string | number; sourceLayer?: string}, Record<string, unknown>];

// Records setFeatureState calls; everything else renderShatter touches is a no-op.
const fakeMap = () => {
  const calls: FeatureStateCall[] = [];
  const map = {
    setFeatureState: (feature: FeatureStateCall[0], state: FeatureStateCall[1]) => {
      calls.push([feature, state]);
    },
    once: () => map,
  };
  return {map: map as unknown as maplibregl.Map, calls};
};

// Last state written to a parent, merged the way MapLibre merges feature-state.
const parentState = (calls: FeatureStateCall[], id: string) =>
  calls
    .filter(([f]) => f.id === id && f.sourceLayer === 'vtds')
    .reduce<Record<string, unknown>>((acc, [, state]) => ({...acc, ...state}), {});

const doc = {document_id: 'd1', parent_layer: 'vtds', child_layer: 'blocks'} as any;

// vtd:A and vtd:B are broken and each sits wholly in one district; vtd:C is split.
const brokenState = () => ({
  zoneAssignments: new Map<string, number | null>([
    ['a1', 1],
    ['a2', 1],
    ['b1', 2],
    ['c1', 1],
    ['c2', 3],
  ]),
  shatterIds: {
    parents: new Set(['vtd:A', 'vtd:B', 'vtd:C']),
    children: new Set(['a1', 'a2', 'b1', 'c1', 'c2']),
  },
  parentToChild: new Map([
    ['vtd:A', new Set(['a1', 'a2'])],
    ['vtd:B', new Set(['b1'])],
    ['vtd:C', new Set(['c1', 'c2'])],
  ]),
  childToParent: new Map([
    ['a1', 'vtd:A'],
    ['a2', 'vtd:A'],
    ['b1', 'vtd:B'],
    ['c1', 'vtd:C'],
    ['c2', 'vtd:C'],
  ]),
});

let calls: FeatureStateCall[];
let map: maplibregl.Map;

beforeEach(() => {
  ({map, calls} = fakeMap());
  useMapControlsStore.setState(state => ({
    mapMode: MAP_MODES.DISTRICTS,
    mapOptions: {...state.mapOptions, highlightBrokenDistricts: true},
  }));
  useMapStore.setState({
    mapDocument: doc,
    getMapRef: () => map,
    mapRenderingState: RENDERING_STATES.LOADED,
    appLoadingState: APP_LOADING_STATES.LOADED,
  });
  useAssignmentsStore.setState({...brokenState(), clientLastUpdated: 'T0'});
});

describe('healParentsIfAllChildrenInSameZone (state)', () => {
  test('replaces the store collections instead of editing them in place', () => {
    const before = useAssignmentsStore.getState();
    useAssignmentsStore.getState().healParentsIfAllChildrenInSameZone({}, 'state');

    const expected = brokenState();
    expect(before.shatterIds.parents).toEqual(expected.shatterIds.parents);
    expect(before.shatterIds.children).toEqual(expected.shatterIds.children);
    expect(before.zoneAssignments).toEqual(expected.zoneAssignments);

    const after = useAssignmentsStore.getState();
    expect(after.shatterIds.parents).toEqual(new Set(['vtd:C']));
    expect(after.shatterIds.children).toEqual(new Set(['c1', 'c2']));
    expect(after.zoneAssignments.get('vtd:A')).toBe(1);
    expect(after.zoneAssignments.get('vtd:B')).toBe(2);
    expect(after.zoneAssignments.has('a1')).toBe(false);
  });

  test("renderShatter clears every healed parent's broken highlight", () => {
    const subscriber = new MapRenderSubscriber(map);
    subscriber.subscribeShatter();
    expect(parentState(calls, 'vtd:A')).toMatchObject({broken: true, highlighted: true});

    useAssignmentsStore
      .getState()
      .healParentsIfAllChildrenInSameZone({_parentIds: new Set(['vtd:A', 'vtd:B'])}, 'state');
    subscriber.assignmentSubscriptions.forEach(unsub => unsub());
    subscriber.controlSubscriptions.forEach(unsub => unsub());
    subscriber.subscriptions.forEach(unsub => unsub());

    expect(parentState(calls, 'vtd:A')).toMatchObject({broken: false, highlighted: false});
    expect(parentState(calls, 'vtd:B')).toMatchObject({broken: false, highlighted: false});
    expect(parentState(calls, 'vtd:C')).toMatchObject({broken: true, highlighted: true});
  });
});
