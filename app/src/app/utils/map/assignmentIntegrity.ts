import type {LngLatBoundsLike} from 'maplibre-gl';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {
  useAssignmentRepairStore,
  type AssignmentIssues,
  type AssignmentRepairPlan,
  type ParentRowChoice,
} from '@/app/store/assignmentRepairStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {getChildEdges} from '@/app/utils/api/apiHandlers/getChildEdges';
import {getPointSelectionData} from '@/app/utils/api/apiHandlers/getPointSelectionData';
import type {ShatterResult} from '@/app/utils/api/apiHandlers/types';
import {zoomToBounds} from '@/app/utils/map/fitBounds';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {MAP_MODES} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

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

/**
 * Turns the check's findings and the user's choices into row changes, keeping
 * only what still applies to the current state. A repair applied twice, or after
 * the map changed since the check, then can't drop rows it no longer should.
 */
export const buildRepairPlan = (
  issues: AssignmentIssues,
  choices: Record<string, ParentRowChoice>,
  current: {
    isBroken: (id: string) => boolean;
    hasRow: (id: string) => boolean;
    isChild: (id: string) => boolean;
  }
): AssignmentRepairPlan => {
  const parentRows = issues.parentRows.filter(id => current.isBroken(id) && current.hasRow(id));
  const keepWhole = parentRows.filter(parent => choices[parent] === 'whole');
  const keepWholeSet = new Set(keepWhole);
  const addBlocks = new Map<string, string[]>();
  issues.missingBlocks.forEach((blocks, parent) => {
    if (keepWholeSet.has(parent) || !current.isBroken(parent)) return;
    const missing = blocks.filter(block => !current.isChild(block));
    if (missing.length) addBlocks.set(parent, missing);
  });
  return {
    keepWhole,
    dropRows: [
      ...parentRows.filter(parent => !keepWholeSet.has(parent)),
      ...issues.unmatched.filter(current.hasRow),
    ],
    addBlocks,
  };
};

const isCoiMode = () => useMapControlsStore.getState().mapMode === MAP_MODES.COI;

/** Shatter state plus "has a saved row" / "has a real assignment" for the active mode. */
const readActiveState = () => {
  if (isCoiMode()) {
    const {shatterIds, parentToChild, communityAssignments} = useCoiAssignmentsStore.getState();
    const sets = Array.from(communityAssignments.values());
    const inAnyCommunity = (id: string) => sets.some(geoids => geoids.has(id));
    return {shatterIds, parentToChild, hasRow: inAnyCommunity, isAssigned: inAnyCommunity};
  }
  const {shatterIds, parentToChild, zoneAssignments} = useAssignmentsStore.getState();
  return {
    shatterIds,
    parentToChild,
    // A null-zone row is still a saved row for the parent, so it counts here.
    hasRow: (id: string) => zoneAssignments.has(id),
    isAssigned: (id: string) => zoneAssignments.get(id) != null,
  };
};

// ponytail: keeps each edges GET's repeated parent_geoid params well under URL limits.
const EDGE_BATCH_SIZE = 100;
// Latest-wins: a check whose result lands after a newer check or a repair began
// would otherwise write stale issues (and reopen the modal) over the newer state.
let checkSeq = 0;

/**
 * Checks the open map for assignment rows that would corrupt its totals. The local
 * checks are cheap and run every time; only when they find something does this
 * fetch the backend's block list for every broken-up unit, to confirm no blocks
 * went missing. Opens the repair modal and returns false when there's anything to
 * repair. Background triggers (`load`, `autosave`) stay quiet once the user has
 * dismissed the modal for this document: still false, but no modal and no refetch.
 */
export const checkAssignments = async (
  trigger: 'load' | 'autosave' | 'save' | 'manual'
): Promise<boolean> => {
  const seq = ++checkSeq;
  const {mapDocument} = useMapStore.getState();
  if (!mapDocument?.districtr_map_slug || mapDocument.access !== ACCESS_STATES.EDIT) {
    useAssignmentRepairStore.setState({issues: null, open: false, choices: {}});
    return true;
  }

  const {shatterIds, parentToChild, hasRow, isAssigned} = readActiveState();
  const parentRows = findParentRows(shatterIds.parents, hasRow);
  const unmatched = demographyService.unmatchedPaths.filter(id => !shatterIds.parents.has(id));
  if (!parentRows.length && !unmatched.length) {
    useAssignmentRepairStore.setState({issues: null, open: false, choices: {}});
    return true;
  }
  const quiet = trigger === 'load' || trigger === 'autosave';
  const repairState = useAssignmentRepairStore.getState();
  if (
    quiet &&
    repairState.dismissedFor === mapDocument.document_id &&
    repairState.issues?.documentId === mapDocument.document_id
  ) {
    return false;
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
  // Superseded: the newer check (or repair) owns the modal. Still report the
  // issues this check saw, so a save started on that state stays blocked.
  if (seq !== checkSeq) return false;
  const {missingBlocks, unverified} = findMissingBlocks(parents, edges, shatterIds.children);

  const {dismissedFor, open, choices: previous} = useAssignmentRepairStore.getState();
  const choices = Object.fromEntries(
    parentRows.map(parent => [
      parent,
      previous[parent] ?? suggestParentRowChoice(parentToChild.get(parent) ?? [], isAssigned),
    ])
  );
  useAssignmentRepairStore.setState({
    issues: {documentId: mapDocument.document_id, parentRows, missingBlocks, unmatched, unverified},
    choices,
    // A dismissed background re-check leaves the modal as it is, so it can't close
    // one a blocked save just opened.
    open: quiet ? open || dismissedFor !== mapDocument.document_id : true,
  });
  return false;
};

/**
 * Applies the user's choices through the active store's repair action, then saves
 * through the normal conflict-checked save. See buildRepairPlan and the stores'
 * repairAssignmentRows for what each choice does to the rows.
 */
export const repairAssignments = async () => {
  const {issues, choices} = useAssignmentRepairStore.getState();
  const {mapDocument} = useMapStore.getState();
  if (!issues || !mapDocument || issues.documentId !== mapDocument.document_id) return;
  ++checkSeq;
  const {shatterIds, hasRow} = readActiveState();
  const plan = buildRepairPlan(issues, choices, {
    isBroken: id => shatterIds.parents.has(id),
    hasRow,
    isChild: id => shatterIds.children.has(id),
  });
  const store = isCoiMode() ? useCoiAssignmentsStore : useAssignmentsStore;
  store.getState().repairAssignmentRows(plan);
  // These rows were flagged against the old demography table; un-breaking a unit
  // re-fetches demography, which re-flags anything still wrong.
  demographyService.clearUnmatched([...issues.parentRows, ...issues.unmatched]);
  demographyService.updatePopulations({
    coalitionGroups: useDemographyStore.getState().coalitionGroups,
  });
  useAssignmentRepairStore.setState({issues: null, open: false, choices: {}});
  await store.getState().handlePutAssignments();
};

let cancelPendingZoom: (() => void) | null = null;

/**
 * Zooms the map to the given units: from their centroids (the first layer whose
 * point data has them) to their rendered outlines, via the same snap-then-fly as
 * the validation panel. `onFound` runs just before the camera moves. Returns
 * false when none of the units are on this map.
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
    const bounds: LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    onFound?.();
    cancelPendingZoom?.();
    cancelPendingZoom = zoomToBounds(map, mapDocument, {bounds, geoIds});
    return true;
  }
  return false;
};
