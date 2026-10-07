import {create} from 'zustand';
import type {LngLatBoundsLike} from 'maplibre-gl';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {getChildEdges} from '@/app/utils/api/apiHandlers/getChildEdges';
import {getPointSelectionData} from '@/app/utils/api/apiHandlers/getPointSelectionData';
import type {ShatterResult} from '@/app/utils/api/apiHandlers/types';
import {idb} from '@/app/utils/idb/idb';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {
  getFitBoundsPadding,
  queryRenderedGeoIdBounds,
} from '@/app/components/sidebar/MapValidation/ZoomToFeature';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {MAP_MODES} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

export type AssignmentIssues = {
  /** Broken-up units that still have their own assignment row. */
  parentRows: string[];
  /** Broken-up unit -> blocks the backend says it contains that the map never saved. */
  missingBlocks: Map<string, string[]>;
  /** Assigned units with no population data that parentRows doesn't explain. */
  unmatched: string[];
  /** Broken-up units whose blocks couldn't be checked (no edges came back). */
  unverified: string[];
};

/**
 * How to resolve a unit saved both whole and as blocks: keep the blocks (drop the
 * whole-unit row), or use the whole unit (drop its blocks and un-break it).
 */
export type ParentRowChoice = 'blocks' | 'whole';

export const useAssignmentRepairStore = create<{
  issues: AssignmentIssues | null;
  open: boolean;
  /** Document whose load-time prompt was waved off; save and manual checks still open. */
  dismissedFor: string | null;
  /** The user's pick per entry in issues.parentRows. */
  choices: Record<string, ParentRowChoice>;
}>(() => ({issues: null, open: false, dismissedFor: null, choices: {}}));

/** Broken-up units that still hold their own assignment. */
export const findParentRows = (parents: Set<string>, isAssigned: (id: string) => boolean) =>
  Array.from(parents).filter(isAssigned);

/**
 * Per broken-up unit, the blocks in `edges` missing from the map's known children.
 * A unit with no edges at all can't be checked, so it's reported as unverified
 * rather than as missing every block.
 */
export const findMissingBlocks = (
  parents: string[],
  edges: ShatterResult,
  children: Set<string>
) => {
  const blocksByParent = new Map<string, string[]>();
  edges.forEach(({parent_path, child_path}) => {
    const blocks = blocksByParent.get(parent_path) ?? [];
    blocks.push(child_path);
    blocksByParent.set(parent_path, blocks);
  });
  const missingBlocks = new Map<string, string[]>();
  const unverified: string[] = [];
  parents.forEach(parent => {
    const blocks = blocksByParent.get(parent);
    if (!blocks?.length) {
      unverified.push(parent);
      return;
    }
    const missing = blocks.filter(block => !children.has(block));
    if (missing.length) missingBlocks.set(parent, missing);
  });
  return {missingBlocks, unverified};
};

/**
 * Suggested fix for a unit saved both ways: if any of its blocks carries an
 * assignment, the blocks hold real edits, so keep them; otherwise the whole-unit
 * row is the only assignment there is.
 */
export const suggestParentRowChoice = (
  blocks: Iterable<string>,
  isAssigned: (id: string) => boolean
): ParentRowChoice => (Array.from(blocks).some(isAssigned) ? 'blocks' : 'whole');

export const hasIssues = (issues: AssignmentIssues) =>
  issues.parentRows.length > 0 || issues.missingBlocks.size > 0 || issues.unmatched.length > 0;

const isCoiMode = () => useMapControlsStore.getState().mapMode === MAP_MODES.COI;

/** Whether a unit holds a real (non-null) assignment in the active map mode. */
const getIsAssigned = (): ((id: string) => boolean) => {
  if (isCoiMode()) {
    const sets = Array.from(useCoiAssignmentsStore.getState().communityAssignments.values());
    return id => sets.some(geoids => geoids.has(id));
  }
  const {zoneAssignments} = useAssignmentsStore.getState();
  return id => zoneAssignments.get(id) != null;
};

// ponytail: keeps each edges GET's repeated parent_geoid params well under URL limits.
const EDGE_BATCH_SIZE = 100;

/**
 * Checks the open map for assignment rows that would corrupt its totals. The local
 * checks are cheap and run every time; only when they find something does this
 * fetch the backend's block list for every broken-up unit, to confirm no blocks
 * went missing. Opens the repair modal and returns false when there's anything to
 * repair (a `load` check stays closed once dismissed for this document).
 */
export const checkAssignments = async (trigger: 'load' | 'save' | 'manual'): Promise<boolean> => {
  const {mapDocument} = useMapStore.getState();
  if (!mapDocument?.districtr_map_slug || mapDocument.access !== ACCESS_STATES.EDIT) return true;

  const coi = isCoiMode();
  const {shatterIds, parentToChild} = coi
    ? useCoiAssignmentsStore.getState()
    : useAssignmentsStore.getState();
  const zoneAssignments = useAssignmentsStore.getState().zoneAssignments;
  const isAssigned = getIsAssigned();
  // A null-zone district row is still a saved row for the parent, so it counts here.
  const hasRow = coi ? isAssigned : (id: string) => zoneAssignments.has(id);

  const parentRows = findParentRows(shatterIds.parents, hasRow);
  const unmatched = demographyService.unmatchedPaths.filter(id => !shatterIds.parents.has(id));
  if (!parentRows.length && !unmatched.length) {
    useAssignmentRepairStore.setState({issues: null, open: false, choices: {}});
    return true;
  }

  const parents = Array.from(shatterIds.parents);
  const edges: ShatterResult = [];
  try {
    for (let i = 0; i < parents.length; i += EDGE_BATCH_SIZE) {
      edges.push(
        ...(await getChildEdges({
          districtr_map_slug: mapDocument.districtr_map_slug,
          geoids: parents.slice(i, i + EDGE_BATCH_SIZE),
        }))
      );
    }
  } catch (error) {
    // Leaves every unit unverified; the local findings still get reported.
    console.error('Failed to fetch block edges for the assignment check', error);
    edges.length = 0;
  }
  const {missingBlocks, unverified} = findMissingBlocks(parents, edges, shatterIds.children);

  const {dismissedFor, choices: previous} = useAssignmentRepairStore.getState();
  const choices = Object.fromEntries(
    parentRows.map(parent => [
      parent,
      previous[parent] ?? suggestParentRowChoice(parentToChild.get(parent) ?? [], isAssigned),
    ])
  );
  useAssignmentRepairStore.setState({
    issues: {parentRows, missingBlocks, unmatched, unverified},
    choices,
    open: trigger !== 'load' || dismissedFor !== mapDocument.document_id,
  });
  return false;
};

type ShatterState = {
  shatterIds: {parents: Set<string>; children: Set<string>};
  parentToChild: Map<string, Set<string>>;
  childToParent: Map<string, string>;
};

const cloneShatterState = (state: ShatterState): ShatterState => ({
  shatterIds: {
    parents: new Set(state.shatterIds.parents),
    children: new Set(state.shatterIds.children),
  },
  parentToChild: new Map(state.parentToChild),
  childToParent: new Map(state.childToParent),
});

const addBlocks = (state: ShatterState, parent: string, blocks: string[]) => {
  state.parentToChild.set(parent, new Set([...(state.parentToChild.get(parent) ?? []), ...blocks]));
  blocks.forEach(block => {
    state.shatterIds.children.add(block);
    state.childToParent.set(block, parent);
  });
};

/** Un-breaks a unit: forgets its blocks and returns them so their rows can be dropped. */
const unbreak = (state: ShatterState, parent: string) => {
  const blocks = Array.from(state.parentToChild.get(parent) ?? []);
  blocks.forEach(block => {
    state.shatterIds.children.delete(block);
    state.childToParent.delete(block);
  });
  state.parentToChild.delete(parent);
  state.shatterIds.parents.delete(parent);
  return blocks;
};

/**
 * Applies the user's picks, then saves through the normal conflict-checked save:
 * - a unit saved both ways keeps its blocks (whole-unit row dropped, missing blocks
 *   added with the whole unit's assignment) or becomes whole again (blocks dropped);
 * - missing blocks of any other broken-up unit come back unassigned;
 * - unmatched rows are dropped.
 */
export const repairAssignments = async () => {
  const {issues, choices} = useAssignmentRepairStore.getState();
  const {mapDocument} = useMapStore.getState();
  if (!issues || !mapDocument) return;
  const now = new Date().toISOString();
  const keepWhole = new Set(issues.parentRows.filter(parent => choices[parent] === 'whole'));
  const dropRows = [
    ...issues.parentRows.filter(parent => !keepWhole.has(parent)),
    ...issues.unmatched,
  ];
  const removedBlocks: string[] = [];

  if (isCoiMode()) {
    const state = useCoiAssignmentsStore.getState();
    const communityAssignments = new Map(
      Array.from(state.communityAssignments, ([community, geoids]) => [community, new Set(geoids)])
    );
    const shatter = cloneShatterState(state);
    issues.missingBlocks.forEach((blocks, parent) => {
      if (keepWhole.has(parent)) return;
      communityAssignments.forEach(geoids => {
        if (geoids.has(parent)) blocks.forEach(block => geoids.add(block));
      });
      addBlocks(shatter, parent, blocks);
    });
    keepWhole.forEach(parent => removedBlocks.push(...unbreak(shatter, parent)));
    const toDelete = [...dropRows, ...removedBlocks];
    communityAssignments.forEach(geoids => toDelete.forEach(id => geoids.delete(id)));
    useCoiAssignmentsStore.setState({...shatter, communityAssignments, clientLastUpdated: now});
    idb.updateIdbCoiAssignments(mapDocument, communityAssignments, now, true);
  } else {
    const state = useAssignmentsStore.getState();
    const zoneAssignments = new Map(state.zoneAssignments);
    const shatter = cloneShatterState(state);
    issues.missingBlocks.forEach((blocks, parent) => {
      if (keepWhole.has(parent)) return;
      const zone = zoneAssignments.get(parent) ?? null;
      blocks.forEach(block => zoneAssignments.set(block, zone));
      addBlocks(shatter, parent, blocks);
    });
    keepWhole.forEach(parent => removedBlocks.push(...unbreak(shatter, parent)));
    [...dropRows, ...removedBlocks].forEach(id => zoneAssignments.delete(id));
    useAssignmentsStore.setState({
      ...shatter,
      zoneAssignments,
      clientLastUpdated: now,
      pendingShatterUndoState: null,
    });
    // After setState: this reads shatter state from the store to tag parent_path.
    idb.updateIdbAssignments(mapDocument, zoneAssignments, now, true);
  }
  if (removedBlocks.length) GeometryWorker?.removeGeometries(removedBlocks);
  // ponytail: no feature-state cleanup; dropped rows are hidden broken-up units or
  // ids with no tile feature, and the zone/shatter subscriptions repaint the rest.

  // The rows just resolved were flagged against the old demography table; drop
  // them so the save check doesn't block on them. Un-breaking a unit re-fetches
  // demography, which re-flags anything still wrong.
  const resolved = new Set([...issues.parentRows, ...issues.unmatched]);
  demographyService.unmatchedPaths = demographyService.unmatchedPaths.filter(
    id => !resolved.has(id)
  );
  demographyService.updatePopulations({
    coalitionGroups: useDemographyStore.getState().coalitionGroups,
  });
  useAssignmentRepairStore.setState({issues: null, open: false, choices: {}});
  const save = isCoiMode()
    ? useCoiAssignmentsStore.getState().handlePutAssignments
    : useAssignmentsStore.getState().handlePutAssignments;
  await save();
};

/**
 * Zooms the map to the given units: jumps to their centroids (from the first
 * layer whose point data has them), then fits their rendered outlines once tiles
 * load. `onFound` runs just before the camera moves. Returns false when none of
 * the units are on this map.
 */
export const zoomToGeoIds = async (
  geoIds: string[],
  layers: string[],
  onFound?: () => void
): Promise<boolean> => {
  const {getMapRef, mapDocument} = useMapStore.getState();
  const map = getMapRef();
  if (!map || !geoIds.length) return false;
  for (const layer of layers) {
    const points = await getPointSelectionData({
      layer,
      columns: ['path', 'x', 'y'],
      source: BLOCK_SOURCE_ID,
      filterIds: new Set(geoIds),
    });
    const coords = points.features.map(feature => feature.geometry.coordinates);
    if (!coords.length) continue;
    const lngs = coords.map(([lng]) => lng);
    const lats = coords.map(([, lat]) => lat);
    const approx: LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    onFound?.();
    map.fitBounds(approx, {maxZoom: 12, duration: 0});
    map.once('idle', () => {
      const bounds = queryRenderedGeoIdBounds(map, mapDocument, geoIds);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: getFitBoundsPadding(map, 1000, 0.4),
          linear: true,
          duration: 800,
        });
      }
    });
    return true;
  }
  return false;
};
