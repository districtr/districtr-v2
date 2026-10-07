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
  type FoundIssues,
  type ParentAssignmentChoice,
} from '@/app/store/assignmentRepairStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {getChildEdges} from '@/app/utils/api/apiHandlers/getChildEdges';
import {getPointSelectionData} from '@/app/utils/api/apiHandlers/getPointSelectionData';
import type {ShatterResult} from '@/app/utils/api/apiHandlers/types';
import {zoomToBounds} from '@/app/utils/map/fitBounds';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {MAP_MODES} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

/** A map's assignment state, as the checks need it. */
export type AssignmentSnapshot = {
  shatterIds: {parents: Set<string>; children: Set<string>};
  parentToChild: Map<string, Set<string>>;
  /** Has a saved assignment, a null-zone district one included. */
  hasAssignment: (id: string) => boolean;
  /** Is in a district, or in any community. */
  hasZone: (id: string) => boolean;
};

type ShatterFields = Pick<AssignmentSnapshot, 'shatterIds' | 'parentToChild'>;

export const districtSnapshot = ({
  shatterIds,
  parentToChild,
  zoneAssignments,
}: ShatterFields & {zoneAssignments: Map<string, unknown>}): AssignmentSnapshot => ({
  shatterIds,
  parentToChild,
  hasAssignment: id => zoneAssignments.has(id),
  hasZone: id => zoneAssignments.get(id) != null,
});

export const communitySnapshot = ({
  shatterIds,
  parentToChild,
  communityAssignments,
}: ShatterFields & {communityAssignments: Map<unknown, Set<string>>}): AssignmentSnapshot => {
  const sets = Array.from(communityAssignments.values());
  const inAnyCommunity = (id: string) => sets.some(geoids => geoids.has(id));
  return {shatterIds, parentToChild, hasAssignment: inAnyCommunity, hasZone: inAnyCommunity};
};

/** Groups the backend's parent/child edges into each shattered parent's blocks. */
export const groupBlocksByParent = (edges: ShatterResult) => {
  const blocksByParent = new Map<string, string[]>();
  edges.forEach(({parent_path, child_path}) => {
    const blocks = blocksByParent.get(parent_path) ?? [];
    blocks.push(child_path);
    blocksByParent.set(parent_path, blocks);
  });
  return blocksByParent;
};

/**
 * Finds what's wrong with a map's assignments. Pure: the same snapshot gives the
 * same answer, so the check and the repair (which re-runs this against the state
 * it's about to change) can't disagree about what's broken.
 *
 * Without `blocksByParent` this is the cheap local pass; with it, it also lists
 * blocks the backend has for a shattered parent that the map doesn't. A parent with
 * no blocks listed can't be checked, so it's reported as unverified rather than as
 * missing every block.
 */
export const findAssignmentIssues = (
  snapshot: AssignmentSnapshot,
  unmatchedPaths: string[],
  blocksByParent?: Map<string, string[]>
): FoundIssues => {
  const {parents, children} = snapshot.shatterIds;
  const missingBlocks = new Map<string, string[]>();
  const unverified: string[] = [];
  if (blocksByParent) {
    parents.forEach(parent => {
      const blocks = blocksByParent.get(parent);
      if (!blocks?.length) {
        unverified.push(parent);
        return;
      }
      const missing = blocks.filter(block => !children.has(block));
      if (missing.length) missingBlocks.set(parent, missing);
    });
  }
  return {
    parentAssignments: Array.from(parents).filter(snapshot.hasAssignment),
    // A shattered parent is never in demography; its own assignment is reported above.
    unmatched: unmatchedPaths.filter(id => !parents.has(id) && snapshot.hasAssignment(id)),
    missingBlocks,
    unverified,
  };
};

export const hasIssues = (issues: FoundIssues) =>
  issues.parentAssignments.length > 0 ||
  issues.missingBlocks.size > 0 ||
  issues.unmatched.length > 0;

/**
 * Ids in `current` the user hasn't seen in `seen`: new parent assignments, new
 * unmatched ids, and parents with newly missing blocks. A repair that finds any
 * re-raises them instead of applying changes the user didn't review.
 */
export const findNewIssueIds = (current: FoundIssues, seen: FoundIssues) => {
  const seenParents = new Set(seen.parentAssignments);
  const seenUnmatched = new Set(seen.unmatched);
  const newIds = [
    ...current.parentAssignments.filter(id => !seenParents.has(id)),
    ...current.unmatched.filter(id => !seenUnmatched.has(id)),
  ];
  current.missingBlocks.forEach((blocks, parent) => {
    const seenBlocks = new Set(seen.missingBlocks.get(parent) ?? []);
    if (blocks.some(block => !seenBlocks.has(block))) newIds.push(parent);
  });
  return Array.from(new Set(newIds));
};

/**
 * Suggested fix for a parent saved both ways: keep the blocks if any of them carries an
 * assignment (they hold real edits); otherwise the parent's own assignment is the only one.
 */
export const suggestParentAssignmentChoice = (
  blocks: Iterable<string>,
  hasZone: (id: string) => boolean
): ParentAssignmentChoice => (Array.from(blocks).some(hasZone) ? 'blocks' : 'whole');

/** A choice for every parent saved both ways: the user's earlier pick, else the suggestion. */
export const suggestChoices = (
  issues: FoundIssues,
  snapshot: AssignmentSnapshot,
  previous: Record<string, ParentAssignmentChoice>
): Record<string, ParentAssignmentChoice> =>
  Object.fromEntries(
    issues.parentAssignments.map(parent => [
      parent,
      previous[parent] ??
        suggestParentAssignmentChoice(snapshot.parentToChild.get(parent) ?? [], snapshot.hasZone),
    ])
  );

/** Turns current issues and the user's choices into assignment changes. */
export const planRepair = (
  issues: FoundIssues,
  choices: Record<string, ParentAssignmentChoice>
): AssignmentRepairPlan => {
  const keepWhole = issues.parentAssignments.filter(parent => choices[parent] === 'whole');
  const keepWholeSet = new Set(keepWhole);
  return {
    keepWhole,
    dropAssignments: [
      ...issues.parentAssignments.filter(parent => !keepWholeSet.has(parent)),
      ...issues.unmatched,
    ],
    // A parent made whole again doesn't need its missing blocks back.
    addBlocks: new Map(
      Array.from(issues.missingBlocks).filter(([parent]) => !keepWholeSet.has(parent))
    ),
  };
};

const isCoiMode = () => useMapControlsStore.getState().mapMode === MAP_MODES.COI;

const readActiveSnapshot = () =>
  isCoiMode()
    ? communitySnapshot(useCoiAssignmentsStore.getState())
    : districtSnapshot(useAssignmentsStore.getState());

const clearRepair = () =>
  useAssignmentRepairStore.setState({
    issues: null,
    open: false,
    choices: {},
    newIds: [],
    populationUpdating: false,
  });

const EDGE_BATCH_SIZE = 100;

/** Every shattered parent's blocks from the backend; empty if the fetch fails. */
const fetchBlocksByParent = async (districtr_map_slug: string, parents: string[]) => {
  const edges: ShatterResult = [];
  try {
    for (let i = 0; i < parents.length; i += EDGE_BATCH_SIZE) {
      edges.push(
        ...(await getChildEdges({
          districtr_map_slug,
          geoids: parents.slice(i, i + EDGE_BATCH_SIZE),
        }))
      );
    }
  } catch (error) {
    // Leaves every parent unverified; the local findings still get reported.
    console.error('Failed to fetch block edges for the assignment check', error);
    return new Map<string, string[]>();
  }
  return groupBlocksByParent(edges);
};

// Latest-wins: a check whose result lands after a newer check or a repair began
// would otherwise write stale issues (and reopen the modal) over the newer state.
let checkSeq = 0;

/**
 * Checks the open map for assignments that would corrupt its totals and shows what it
 * finds. Runs the cheap local pass; only if that finds something, fetches every
 * shattered parent's blocks, re-runs the check with them, and opens the repair modal.
 * Returns false when anything needs fixing. Background triggers (`load`, `autosave`)
 * stay quiet after "Not now": still false, but no modal and no refetch.
 */
export const checkAssignments = async (
  trigger: 'load' | 'autosave' | 'save' | 'manual'
): Promise<boolean> => {
  const seq = ++checkSeq;
  const {mapDocument} = useMapStore.getState();
  if (!mapDocument?.districtr_map_slug || mapDocument.access !== ACCESS_STATES.EDIT) {
    clearRepair();
    return true;
  }

  const before = readActiveSnapshot();
  if (!hasIssues(findAssignmentIssues(before, demographyService.unmatchedPaths))) {
    clearRepair();
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

  const blocksByParent = await fetchBlocksByParent(
    mapDocument.districtr_map_slug,
    Array.from(before.shatterIds.parents)
  );
  // Superseded: the newer check (or repair) owns the modal. Still report the
  // issues this check saw, so a save started on that state stays blocked.
  if (seq !== checkSeq) return false;
  // Re-read after the fetch: the map may have changed while it ran.
  const snapshot = readActiveSnapshot();
  const found = findAssignmentIssues(snapshot, demographyService.unmatchedPaths, blocksByParent);
  if (!hasIssues(found)) {
    clearRepair();
    return true;
  }

  const {dismissedFor, open, choices: previous} = useAssignmentRepairStore.getState();
  useAssignmentRepairStore.setState({
    issues: {...found, documentId: mapDocument.document_id, blocksByParent},
    choices: suggestChoices(found, snapshot, previous),
    newIds: [],
    populationUpdating: false,
    // A dismissed background re-check leaves the modal as it is, so it can't close
    // one a blocked save just opened.
    open: quiet ? open || dismissedFor !== mapDocument.document_id : true,
  });
  return false;
};

/**
 * Applies the user's choices through the active store's applyAssignmentRepair, then
 * saves through the normal conflict-checked save. The store applies nothing:
 * - while demography lags a shatter or heal, because its unmatched ids may be stale and
 *   removing them could delete assignments that are now valid (the modal says so);
 * - when its re-check of the state it's about to change finds anything the user hasn't
 *   seen (the modal shows the current list with those marked New).
 * A repair clears undo history, since undoing it could only bring the bad assignments back.
 */
export const repairAssignments = async () => {
  const {issues, choices} = useAssignmentRepairStore.getState();
  const {mapDocument} = useMapStore.getState();
  if (!issues || !mapDocument || issues.documentId !== mapDocument.document_id) return;
  ++checkSeq;
  const store = isCoiMode() ? useCoiAssignmentsStore : useAssignmentsStore;
  const result = store.getState().applyAssignmentRepair(issues, choices);
  if (!result.applied && result.reason === 'loading') {
    // The load check re-runs when the data lands and refreshes the list.
    useAssignmentRepairStore.setState({populationUpdating: true, open: true});
    return;
  }
  if (!result.applied) {
    useAssignmentRepairStore.setState({
      issues: {...issues, ...result.current},
      choices: suggestChoices(result.current, readActiveSnapshot(), choices),
      newIds: result.newIds,
      open: true,
    });
    return;
  }
  // These were flagged against the old demography table; un-shattering a parent
  // re-fetches demography, which re-flags anything still wrong.
  demographyService.clearUnmatched([...issues.parentAssignments, ...issues.unmatched]);
  demographyService.updatePopulations({
    coalitionGroups: useDemographyStore.getState().coalitionGroups,
  });
  clearRepair();
  await store.getState().handlePutAssignments();
};

let cancelPendingZoom: (() => void) | null = null;

/**
 * Zooms the map to the given geo ids: from their centroids (from the first layer whose
 * point data has them) to their rendered outlines, using the validation panel's
 * snap-then-fly. `onFound` runs just before the camera moves. Returns false when none
 * of them are on this map.
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
