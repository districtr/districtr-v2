import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {useMapStore} from './mapStore';
import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';
import {idb} from '../utils/idb/idb';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {districtSnapshot, findAssignmentIssues} from '../utils/map/assignmentIntegrity';

const doc = {
  document_id: 'd1',
  access: 'edit',
  parent_layer: 'vtds',
  child_layer: 'blocks',
  document_comments: [],
} as any;

// The map's feature-state, which mutateZoneAssignments reads and writes.
let featureState: Record<string, Record<string, Record<string, unknown>>>;
const map = {
  style: {
    tileManagers: {
      [BLOCK_SOURCE_ID]: {getState: () => ({state: featureState, stateChanges: {}})},
    },
  },
  setFeatureState: ({id, sourceLayer}: {id: string; sourceLayer: string}, state: object) => {
    featureState[sourceLayer] ??= {};
    featureState[sourceLayer][id] = {...featureState[sourceLayer][id], ...state};
  },
} as any;

const feature = (id: string, sourceLayer: string) =>
  ({id, sourceLayer, properties: {total_pop_20: '10'}}) as unknown as MapGeoJSONFeature;

/** One paint gesture: stage the features, then ingest at gesture end. */
const stroke = (features: MapGeoJSONFeature[], zone: number) => {
  useAssignmentsStore.getState().mutateZoneAssignments(map, features, zone);
  useAssignmentsStore.getState().ingestAccumulatedAssignments();
};

beforeEach(() => {
  spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
  featureState = {blocks: {b1: {zone: 1}, b2: {zone: 2}}};
  useMapStore.setState({mapDocument: doc, captiveIds: new Set(), getMapRef: () => map});
  // vtd P is broken into blocks b1 (district 1) and b2 (district 2).
  useAssignmentsStore.setState({
    zoneAssignments: new Map([
      ['b1', 1],
      ['b2', 2],
    ]),
    accumulatedAssignments: new Map(),
    shatterIds: {parents: new Set(['P']), children: new Set(['b1', 'b2'])},
    parentToChild: new Map([['P', new Set(['b1', 'b2'])]]),
    childToParent: new Map([
      ['b1', 'P'],
      ['b2', 'P'],
    ]),
    clientLastUpdated: 'T0',
  });
});
afterEach(() => mock.restore());

describe('painting after a heal', () => {
  test("doesn't assign a healed unit's blocks that paint sources still return", () => {
    // Painting b2 into district 1 heals P into one unit.
    stroke([feature('b2', 'blocks')], 1);
    expect(useAssignmentsStore.getState().zoneAssignments).toEqual(new Map([['P', 1]]));
    expect(useAssignmentsStore.getState().shatterIds.children.size).toBe(0);

    // The next stroke still finds P's blocks (the block layer's filter hasn't reloaded,
    // or the county brush cached them) along with P itself.
    stroke([feature('P', 'vtds'), feature('b1', 'blocks'), feature('b2', 'blocks')], 2);
    const state = useAssignmentsStore.getState();
    expect(state.zoneAssignments).toEqual(new Map([['P', 2]]));

    // Reloaded from the server, which tags every block with its unit, the plan has
    // nothing for the repair dialog to report as saved both whole and as blocks.
    const reloaded = formatAssignmentsFromDocument(
      Array.from(state.zoneAssignments, ([geo_id, zone]) => ({
        document_id: 'd1',
        geo_id,
        zone,
        parent_path: geo_id.startsWith('b') ? 'P' : null,
      }))
    );
    expect(findAssignmentIssues(districtSnapshot(reloaded), []).parentAssignments).toEqual([]);
  });

  test("communities don't stage a whole unit's blocks either", () => {
    // P is whole: none of its blocks are broken out.
    useCoiAssignmentsStore.setState({
      accumulatedAssignments: new Map(),
      shatterIds: {parents: new Set(), children: new Set()},
    });
    useCoiAssignmentsStore
      .getState()
      .mutateCommunityAssignments(map, [feature('P', 'vtds'), feature('b1', 'blocks')], 1);
    expect(Array.from(useCoiAssignmentsStore.getState().accumulatedAssignments.keys())).toEqual([
      'P',
    ]);
  });
});
