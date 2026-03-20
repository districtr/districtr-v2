import {
  GDBPath,
  NullableZone,
  Zone,
  ConflictContext,
  ConflictResolutionOptions,
  SyncConflictResolution,
} from '@constants/types';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {Map as MaplibreMap, MapGeoJSONFeature} from 'maplibre-gl';
import {Community, DocumentObject} from '../utils/api/apiHandlers/types';
import {
  DEFAULT_COMMUNITY_DESCRIPTION,
  getCommunityFeatureStateKey,
  getPrimaryCommunityId,
  sortCommunitiesByRenderOrder,
} from '../utils/communities';
import {colorScheme as DefaultColorScheme} from '@/app/constants/colors';
import {useChartStore} from './chartStore';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {idb} from '../utils/idb/idb';
import GeometryWorker from '../utils/GeometryWorker';

import {putUpdateCoiAssignmentsAndVerify} from '../utils/api/apiHandlers/putUpdateCoiAssignmentsAndVerify';
import {formatCoiAssignmentsFromDocument} from '../utils/map/formatCoiAssignments';
import {fetchDocument, SyncConflictInfo} from '../utils/api/apiHandlers/fetchDocument';

import {getAssignments} from '../utils/api/apiHandlers/getAssignments';
import {createMapDocument} from '../utils/api/apiHandlers/createMapDocument';
import {confirmMapDocumentUrlParameter} from '../utils/map/confirmMapDocumentUrlParameter';

import {createWithFullMiddlewares} from './middlewares';
import {coiAssignmentsTemporalConfig} from './middlewareConfig';
import {
  DocumentNotFoundError,
  DocumentCreationError,
  DocumentConflictResolutionError,
} from './errors';

export type CommunityAssignmentsMap = Map<Zone, Set<string>>;
export type CommunityVisibilityMap = Map<Zone, boolean>;
export type CommunityData = Community & {
  visible: boolean;
  assignments: Set<string>;
  lastUpdated: string | null;
};
export type CoiPaintMode = 'brush' | 'eraser';
export type CoiAccumulatedMutation =
  | {type: 'assign'; community: Zone}
  | {type: 'erase-community'; community: Zone};

export type CoiAssignmentsPayload = {
  communityAssignments: CommunityAssignmentsMap;
  communityVisibility?: CommunityVisibilityMap;
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  parentToChild: Map<string, Set<string>>;
  childToParent: Map<string, string>;
};

export interface CoiAssignmentsStore {
  /** Map of community id -> set of geoids (overlap allowed). */
  communityAssignments: CommunityAssignmentsMap;
  /** Map determining if a community is visible or hidden in the UI. */
  communityVisibility: CommunityVisibilityMap;
  /** Sets the visibility of a particular community */
  setCommunityVisibility: (community: Zone, isVisible: boolean) => void;
  /** Sets the visibility of list of communities */
  setCommunityVisibilityForCommunities: (communities: Iterable<Zone>, isVisible: boolean) => void;

  ensureCommunityVisibility: (community: Zone) => void;
  removeCommunityVisibility: (community: Zone) => void;
  getCommunityData: (community: Zone) => CommunityData | null;
  getCommunitiesData: () => CommunityData[];

  /** Tracks last update time for each community. */
  communityLastUpdated: Map<Zone, string>;
  /** Pending paint mutations: geoid -> assign/erase operation. */
  accumulatedAssignments: Map<string, CoiAccumulatedMutation>;

  /** Parent/child ids for shattered geometries. */
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  /** Parent -> children mapping for shattered geometries. */
  parentToChild: Map<string, Set<string>>;
  /** Child -> parent mapping for shattered geometries. */
  childToParent: Map<string, string>;

  clientLastUpdated: string;
  setClientLastUpdated: (updatedAt: string) => void;

  /** Mirrored community metadata for undo/redo tracking. Authoritative source is mapStore. */
  communities: Community[];
  /** Atomically syncs communities from mapStore and updates the timestamp (triggers temporal snapshot). */
  syncCommunitiesAndTimestamp: (clientLastUpdated: string) => void;

  /** Lookup helpers for rendering/UI. */
  getCommunitiesForGeoid: (geoid: string) => Set<Zone>;
  getPrimaryCommunityForGeoid: (geoid: string) => NullableZone;

  /** Immediate (non-accumulated) assignment updates. */
  assignGeoidsToCommunity: (geoidSet: Set<GDBPath>, community: Zone) => void;

  /** Paint-phase mutation; writes feature-state immediately and queues store updates. */
  mutateCommunityAssignments: (
    mapRef: MaplibreMap,
    features: Array<MapGeoJSONFeature>,
    community: Zone,
    mode?: CoiPaintMode
  ) => void;

  setAccumulatedAssignments: (
    assignments: CoiAssignmentsStore['accumulatedAssignments'],
    communitiesUpdated: Set<Zone>
  ) => void;

  /** Flushes accumulated paint updates into canonical store state. */
  ingestAccumulatedAssignments: () => void;

  /**
   * Heals shattered parents when every child belongs to the exact same set of communities.
   */
  healParentsIfAllChildrenInSameCommunities: (parentIds?: Set<string>) => void;

  /** Ingests COI assignments and shatter state from document payload. */
  ingestFromDocument: (data: CoiAssignmentsPayload, mapDocument?: DocumentObject) => void;

  replaceCommunityAssignments: (assignments: CommunityAssignmentsMap) => void;
  resetCommunityAssignments: () => void;

  setShatterState: (
    state: Pick<CoiAssignmentsStore, 'shatterIds' | 'parentToChild' | 'childToParent'>
  ) => void;
  resetShatterState: () => void;

  /**
   * Removes all communities above a certain community id. This is used when "trimming"
   * communities in the UI to ensure that there are no "gaps" in the community numbering. For
   * example, if we have communities 1, 2, 3, and the user trims down to 2, we want to
   * remove community 3 entirely so that we don't end up with communities 1 and 3 but no 2.
   *
   * @param maxCommunity The maximum community id to keep; all communities with id greater than
   * this will be removed
   * @returns void
   */
  removeCommunitiesAbove: (maxCommunity: number) => void;
  removeCommunity: (removedCommunity: Zone) => void;

  handlePutAssignments: (overwrite?: boolean) => Promise<void>;
  handleRevert: (mapDocument: DocumentObject) => Promise<void>;
  resolveConflict: (
    resolution: SyncConflictResolution,
    syncConflictInfo: SyncConflictInfo,
    options: ConflictResolutionOptions
  ) => Promise<void>;
  handlePutAssignmentsConflict: (
    resolution: SyncConflictResolution,
    syncConflictInfo: SyncConflictInfo,
    options?: {
      onNavigate?: (documentId: string) => void;
      onComplete?: () => void;
      context?: ConflictContext;
    }
  ) => Promise<void>;
}

// ========================================================
// == Helpers for manipulating community assignments map ==
// ========================================================

/**
 * Creates a deep copy of the community assignments map. This is necessary because the map
 * contains sets, which are reference types, so a shallow copy would not be sufficient to avoid
 * mutating the original state.
 *
 * @param assignments The community assignments map to copy
 * @returns A deep copy of the community assignments map
 */
const deepCopyCommunityAssignments = (
  assignments: CommunityAssignmentsMap
): CommunityAssignmentsMap => {
  const copy = new Map<Zone, Set<string>>();
  assignments.forEach((geoids, community) => {
    copy.set(community, new Set(geoids));
  });
  return copy;
};

/**
 * Returns the set of communities that a given geoid is part of based on the community assignments map.
 *
 * @param assignments The community assignments map to query
 * @param geoid The geoid to look up
 * @returns A set of communities that the geoid is part of
 */
const getCommunitiesForGeoidFromAssignments = (
  assignments: CommunityAssignmentsMap,
  geoid: string
): Set<Zone> => {
  const communities = new Set<Zone>();
  assignments.forEach((geoids, community) => {
    if (geoids.has(geoid)) {
      communities.add(community);
    }
  });
  return communities;
};

/**
 * Compares two sets of communities for equality. Returns true if the sets contain the same
 * communities, false otherwise.
 *
 * @param left The first set of communities to compare
 * @param right The second set of communities to compare
 * @return boolean indicating whether the two sets of communities are equal
 */
const areCommunitySetsEqual = (left: Set<Zone>, right: Set<Zone>) => {
  if (left.size !== right.size) return false;
  for (const community of left) {
    if (!right.has(community)) return false;
  }
  return true;
};

/**
 * Creates a deep copy of the parentToChild map. This is necessary because the map contains sets,
 * which are reference types, so a shallow copy would not be sufficient to avoid mutating the
 * original state.
 *
 * @param parentToChild The parentToChild map to copy
 * @return A deep copy of the parentToChild map
 */
const cloneParentToChildMap = (parentToChild: Map<string, Set<string>>) => {
  const copy = new Map<string, Set<string>>();
  parentToChild.forEach((children, parentId) => {
    copy.set(parentId, new Set(children));
  });
  return copy;
};

/**
 * Builds a community visibility map for a given set of community ids. This is used to ensure that
 * we have a consistent visibility map that includes all communities, even if they don't have an
 * explicit visibility setting in the store (in which case they default to visible).
 *
 * @param communityIds The set of community ids to build the visibility map for
 * @param currentVisibility The current community visibility map from the store, which may be used
 * to preserve existing visibility settings for communities that are still present
 * @return A community visibility map that includes all provided community ids, with preserved
 * settings for any communities that were already present in the currentVisibility map
 */
const buildCommunityVisibilityMap = (
  communityIds: Iterable<Zone>,
  currentVisibility: CommunityVisibilityMap = new Map()
) => {
  const nextVisibility = new Map<Zone, boolean>();
  for (const communityId of communityIds) {
    nextVisibility.set(communityId, currentVisibility.get(communityId) ?? true);
  }
  return nextVisibility;
};

/**
 * Builds a CommunityData object for a given community by combining the community metadata with its
 * assignments and visibility from the store. This is used to provide a single source of truth for
 * the state of a community that can be easily consumed by the UI.
 *
 * @param community The community metadata to build the state for
 * @param communityAssignments The community assignments map from the store
 * @param communityVisibility The community visibility map from the store
 * @param communityLastUpdated The community last updated map from the store
 * @return A CommunityData object representing the current state of the community
 */
const buildCommunityState = ({
  community,
  communityAssignments,
  communityVisibility,
  communityLastUpdated,
}: {
  community: Community;
  communityAssignments: CommunityAssignmentsMap;
  communityVisibility: CommunityVisibilityMap;
  communityLastUpdated: Map<Zone, string>;
}): CommunityData => ({
  ...community,
  visible: communityVisibility.get(community.id) ?? true,
  assignments: new Set(communityAssignments.get(community.id) ?? []),
  lastUpdated: communityLastUpdated.get(community.id) ?? null,
});

/**
 * Returns the "primary" community that a given geoid is part of based on the community
 * assignments map. The primary community is the one with the highest render order, matching the
 * top-most visible COI layer. If the geoid is not part of any community, returns null.
 *
 * @param assignments The community assignments map to query
 * @param geoid The geoid to look up
 *
 * @returns The primary community that the geoid is part of, or null if it is not part of any
 * community
 */
const getPrimaryCommunityForGeoidFromAssignments = (
  assignments: CommunityAssignmentsMap,
  geoid: string
): NullableZone => {
  return getPrimaryCommunityId(
    getCommunitiesForGeoidFromAssignments(assignments, geoid),
    useMapStore.getState().communities
  );
};

/**
 * Inserts a geoid into a community in the community assignments map. If the community does not
 * already exist in the map, it is created. This function mutates the provided map.
 *
 * @param geoid The geoid to insert
 * @param community The community to insert the geoid into
 * @param assignments The community assignments map to modify
 * @returns void
 */
const insertGeoidIntoCommunity = (
  geoid: string,
  community: Zone,
  assignments: CommunityAssignmentsMap
): void => {
  const curr = assignments.get(community);
  if (curr) {
    curr.add(geoid);
    return;
  }
  assignments.set(community, new Set([geoid]));
};

/**
 * Removes a geoid from all communities it is currently part of in the community assignments map.
 * If a community becomes empty as a result, it is removed from the map. This function mutates the
 * provided map.
 *
 * @param assignments The community assignments map to modify
 * @param geoid The geoid to remove
 *
 * @returns A set of communities that the geoid was removed from
 */
const removeGeoidFromAllCommunities = (
  assignments: CommunityAssignmentsMap,
  geoid: string
): Set<Zone> => {
  const communitiesContainingGeoid = new Set<Zone>();
  assignments.forEach((geoids, community) => {
    if (geoids.has(geoid)) {
      geoids.delete(geoid);
      communitiesContainingGeoid.add(community);
      if (!geoids.size) {
        assignments.delete(community);
      }
    }
  });
  return communitiesContainingGeoid;
};

/**
 * Removes a geoid from a specific community. Returns true if a change was made, false if the
 * geoid was not part of that community.
 *
 * @param assignments The community assignments map to modify
 * @param geoid The geoid to remove
 * @param community The community to remove the geoid from
 *
 * @returns boolean indicating whether a change was made
 */
const removeGeoidFromCommunity = (
  assignments: CommunityAssignmentsMap,
  geoid: string,
  community: Zone
): boolean => {
  const geoids = assignments.get(community);
  if (!geoids || !geoids.has(geoid)) return false;
  geoids.delete(geoid);
  if (!geoids.size) {
    assignments.delete(community);
  }
  return true;
};

/**
 * Builds a feature state update object for a given set of previous and new communities. The update
 * includes a `selected` property (true if the geoid is part of any community), a `community`
 * property (the primary community), and a `zone` property (the primary community, for
 * compatibility with existing paint logic). Additionally, it includes a boolean property for
 * each community indicating whether the geoid is part of that community, which allows for more
 * efficient paint updates.
 *
 * @param prevCommunities The set of communities the geoid was previously part of
 * @param newCommunities The set of communities the geoid is now part of
 * @returns An object representing the feature state update to apply
 */
const buildFeatureStateUpdateForCommunities = (
  prevCommunities: Set<Zone>,
  newCommunities: Set<Zone>
) => {
  const nextPrimaryCommunity = getPrimaryCommunityId(
    newCommunities,
    useMapStore.getState().communities
  );
  const updatedKeys = new Set<string>();
  const featureStateUpdate: Record<string, unknown> = {
    selected: nextPrimaryCommunity !== null,
    community: nextPrimaryCommunity,
    // The hightlight/background logic keys off the `zone` property, so we need that to be available
    zone: nextPrimaryCommunity,
  };
  // We also need to set a key for each community that was added or removed so that the feature
  // state update triggers a paint update for those communities
  prevCommunities.forEach(communityId => {
    updatedKeys.add(getCommunityFeatureStateKey(communityId) ?? `community_${communityId}`);
  });
  newCommunities.forEach(communityId => {
    updatedKeys.add(getCommunityFeatureStateKey(communityId) ?? `community_${communityId}`);
  });
  updatedKeys.forEach(featureStateKey => {
    featureStateUpdate[featureStateKey] = false;
  });
  newCommunities.forEach(communityId => {
    featureStateUpdate[getCommunityFeatureStateKey(communityId) ?? `community_${communityId}`] =
      true;
  });

  return featureStateUpdate;
};

type CoiShatterState = CoiAssignmentsStore['shatterIds'];
/** Given a set of affected geometries, returns the set of parent geometries that should be
 * checked for healing.
 *
 * @param affectedGeometries The set of geometries that were affected by the most recent mutation
 * @param shatterIds The current shatter state from the store, used to determine which geometries
 * are parents/children
 * @param childToParent The current child-to-parent mapping from the store, used to find the parent
 * geometry for any affected children
 * @return A set of parent geometry ids that should be checked for healing
 */
const getTouchedParentIds = ({
  affectedGeometries,
  shatterIds,
  childToParent,
}: {
  affectedGeometries: Iterable<string>;
  shatterIds: CoiShatterState;
  childToParent: Map<string, string>;
}) => {
  const touchedParentIds = new Set<string>();
  for (const geoid of affectedGeometries) {
    if (!shatterIds.children.has(geoid)) continue;
    const parentId = childToParent.get(geoid);
    if (parentId) {
      touchedParentIds.add(parentId);
    }
  }
  return touchedParentIds;
};

type HealParentsFn = CoiAssignmentsStore['healParentsIfAllChildrenInSameCommunities'];
/**
 * Checks the parents of the affected geometries to see if any of them are eligible for healing
 * (i.e. all of their children belong to the same set of communities), and heals them if they are.
 * This is called after ingesting accumulated assignments to ensure that any eligible parents are
 * healed as soon as possible, which helps to keep the map state consistent.
 *
 * @param affectedGeometries The set of geometries that were affected by the most recent mutation.
 * @param shatterIds The current shatter state from the store.
 * @param childToParent The current child-to-parent mapping from the store.
 * @param healParentsIfAllChildrenInSameCommunities The healing function for mending eligible
 * parents.
 */
const healTouchedParentsIfEligible = ({
  affectedGeometries,
  shatterIds,
  childToParent,
  healParentsIfAllChildrenInSameCommunities,
}: {
  affectedGeometries: Iterable<string>;
  shatterIds: CoiShatterState;
  childToParent: Map<string, string>;
  healParentsIfAllChildrenInSameCommunities: HealParentsFn;
}) => {
  const touchedParentIds = getTouchedParentIds({
    affectedGeometries,
    shatterIds,
    childToParent,
  });
  const controlsState = useMapControlsStore.getState();
  if (
    touchedParentIds.size &&
    controlsState.activeTool !== 'shatter' &&
    controlsState.mapOptions.mode !== 'break'
  ) {
    healParentsIfAllChildrenInSameCommunities(touchedParentIds);
  }
};

/**
 * Helper function to load assignments from IDB for a given document ID, used in conflict
 * resolution when the user opts to keep their local version. Fetches the document from IDB
 * and formats the assignments for ingestion into the store.
 *
 * @param documentId - The ID of the document whose assignments should be loaded from IDB.
 * @return A promise that resolves to the formatted assignments data ready for ingestion into
 * the store.
 * @throws If no document is found in IDB for the given document ID.
 */
const loadLocalCoiAssignments = async (documentId: string) => {
  const doc = await idb.getDocument(documentId);
  if (!doc) {
    throw new DocumentNotFoundError(`Document with id ${documentId} not found in IDB`);
  }
  return formatCoiAssignmentsFromDocument(doc.assignments);
};

/** Shared dependencies for COI conflict resolution helpers. */
type CoiConflictDependencies = {
  syncConflictInfo: SyncConflictInfo;
  store: CoiAssignmentsStore;
  setMapDocument: (doc: DocumentObject) => void;
  setMapLock: (lock: {isLocked: boolean; reason: string} | null) => void;
  onNavigate?: (documentId: string) => void;
  onComplete?: () => void;
};

/**
 * Resolves a COI sync conflict by keeping the local (IDB) version without pushing it to the
 * server. In a "load" context the local community assignments are loaded from IDB and ingested
 * into the store. In a "save" context this is a no-op because the local state is already in
 * memory.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 * @param context - Whether the conflict arose during a "save" or "load" operation.
 * @returns A promise that resolves once the local assignments have been ingested (load) or
 *   immediately (save).
 */
const coiResolveKeepLocal = async (
  {syncConflictInfo, store, setMapDocument}: CoiConflictDependencies,
  context: ConflictContext
) => {
  if (context === ConflictContext.Load) {
    setMapDocument(syncConflictInfo.localDocument);
    const data = await loadLocalCoiAssignments(syncConflictInfo.localDocument.document_id);
    store.ingestFromDocument(data);
  }
};

/**
 * Resolves a COI sync conflict by treating the local (IDB) version as authoritative and
 * overwriting the server. In a "save" context this retries the save with the overwrite flag.
 * In a "load" context the local community assignments are loaded from IDB, ingested into the
 * store, and then pushed to the server with overwrite enabled.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 * @param context - Whether the conflict arose during a "save" or "load" operation.
 * @returns A promise that resolves once the local assignments have been saved to the server and
 *   the store's `clientLastUpdated` has been synced with the server's response timestamp.
 * @throws If the server rejects the assignment upload.
 */
const coiResolveUseLocal = async (
  {syncConflictInfo, store, setMapDocument, setMapLock}: CoiConflictDependencies,
  context: ConflictContext
) => {
  if (context === ConflictContext.Save) {
    await store.handlePutAssignments(true);
    return;
  }
  setMapLock({
    isLocked: true,
    reason: 'Loading local assignments and overwriting cloud assignments.',
  });
  try {
    setMapDocument(syncConflictInfo.localDocument);
    const data = await loadLocalCoiAssignments(syncConflictInfo.localDocument.document_id);
    store.ingestFromDocument(data);
    const response = await putUpdateCoiAssignmentsAndVerify({
      mapDocument: syncConflictInfo.localDocument,
      communityAssignments: data.communityAssignments,
      shatterIds: data.shatterIds,
      childToParent: data.childToParent,
      overwrite: true,
    });
    if (!response.ok) {
      throw new DocumentConflictResolutionError(
        'Failed to post local assignments when resolving conflict.'
      );
    }
    store.setClientLastUpdated(response.response.updated_at);
  } finally {
    setMapLock(null);
  }
};

/**
 * Resolves a COI sync conflict by discarding local changes and replacing them with the server's
 * version. Fetches the latest community assignments from the server, sets the server document as
 * the active document, and ingests the remote assignments into the store.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 * @returns A promise that resolves once the server assignments have been fetched and ingested.
 * @throws If the server assignment fetch fails.
 */
const coiResolveUseServer = async ({
  syncConflictInfo,
  store,
  setMapDocument,
  setMapLock,
}: CoiConflictDependencies) => {
  setMapLock({
    isLocked: true,
    reason: 'Loading cloud assignments and overwriting local assignments.',
  });
  try {
    const remoteAssignments = await getAssignments(syncConflictInfo.serverDocument);
    if (!remoteAssignments.ok) {
      throw new DocumentConflictResolutionError(
        'Failed to get server assignments when resolving conflict.'
      );
    }
    setMapDocument(syncConflictInfo.serverDocument);
    const data = formatCoiAssignmentsFromDocument(remoteAssignments.response);
    store.ingestFromDocument(data, syncConflictInfo.serverDocument);
  } finally {
    setMapLock(null);
  }
};

/**
 * Resolves a COI sync conflict by creating a brand-new document (a "fork") and uploading the
 * user's local community assignments to it. This preserves both the original server document
 * (untouched) and the user's local edits (saved under a new document ID). After the upload
 * succeeds, the user is navigated to the new document's COI edit URL.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 *   `onNavigate` is used to redirect the user to the forked document's edit page if provided;
 *   otherwise falls back to `history.pushState`.
 * @returns A promise that resolves once the new document has been created, assignments uploaded,
 *   and navigation triggered.
 * @throws If document creation or assignment upload fails.
 */
const coiResolveFork = async ({
  syncConflictInfo,
  store,
  setMapDocument,
  setMapLock,
  onNavigate,
}: CoiConflictDependencies) => {
  setMapLock({isLocked: true, reason: 'Creating a new plan from your changes.'});
  try {
    const createMapDocumentResponse = await createMapDocument(syncConflictInfo.serverDocument);
    if (!createMapDocumentResponse.ok) {
      throw new DocumentCreationError('Failed to create map document from assignments on server');
    }
    setMapDocument(createMapDocumentResponse.response);
    const data = await loadLocalCoiAssignments(syncConflictInfo.localDocument.document_id);
    const response = await putUpdateCoiAssignmentsAndVerify({
      mapDocument: createMapDocumentResponse.response,
      communityAssignments: data.communityAssignments,
      shatterIds: data.shatterIds,
      childToParent: data.childToParent,
      overwrite: true,
    });
    if (!response.ok) {
      throw new DocumentConflictResolutionError(
        'Failed to post local assignments when resolving conflict.'
      );
    }
    const updatedDocument = {
      ...createMapDocumentResponse.response,
      updated_at: response.response.updated_at,
    };
    setMapDocument(updatedDocument);
    store.setClientLastUpdated(response.response.updated_at);
    store.ingestFromDocument(data, updatedDocument);
    if (onNavigate) {
      onNavigate(createMapDocumentResponse.response.document_id);
    } else {
      history.pushState(null, '', `/coi/edit/${createMapDocumentResponse.response.document_id}`);
    }
  } finally {
    setMapLock(null);
  }
};

// ==============================
// == Zustand store definition ==
// ==============================

export const useCoiAssignmentsStore = createWithFullMiddlewares<CoiAssignmentsStore>(
  'Districtr COI Assignments Store',
  coiAssignmentsTemporalConfig
)((set, get) => ({
  communityAssignments: new Map<Zone, Set<string>>(),
  communityVisibility: new Map<Zone, boolean>(),
  setCommunityVisibility: (community: Zone, isVisible: boolean) => {
    const newVisibility = new Map(get().communityVisibility);
    newVisibility.set(community, isVisible);
    set({communityVisibility: newVisibility});
  },
  setCommunityVisibilityForCommunities: (communities: Iterable<Zone>, isVisible: boolean) => {
    const newVisibility = new Map(get().communityVisibility);
    for (const community of communities) {
      newVisibility.set(community, isVisible);
    }
    set({communityVisibility: newVisibility});
  },

  ensureCommunityVisibility: (community: Zone) => {
    const newVisibility = new Map(get().communityVisibility);
    newVisibility.set(community, true);
    set({communityVisibility: newVisibility});
  },
  removeCommunityVisibility: (community: Zone) => {
    const newVisibility = new Map(get().communityVisibility);
    newVisibility.delete(community);
    set({communityVisibility: newVisibility});
  },
  getCommunityData: (community: Zone) => {
    const {communities} = useMapStore.getState();
    const communityMetadata = communities.find((item: Community) => item.id === community);
    if (!communityMetadata) return null;
    const {communityAssignments, communityVisibility, communityLastUpdated} = get();
    return buildCommunityState({
      community: communityMetadata,
      communityAssignments,
      communityVisibility,
      communityLastUpdated,
    });
  },
  getCommunitiesData: () => {
    const {communities} = useMapStore.getState();
    const {communityAssignments, communityVisibility, communityLastUpdated} = get();
    return sortCommunitiesByRenderOrder(communities).map(community =>
      buildCommunityState({
        community,
        communityAssignments,
        communityVisibility,
        communityLastUpdated,
      })
    );
  },
  communityLastUpdated: new Map<Zone, string>(),
  accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
  shatterIds: {
    parents: new Set<string>(),
    children: new Set<string>(),
  },
  parentToChild: new Map<string, Set<string>>(),
  childToParent: new Map<string, string>(),
  clientLastUpdated: '',
  communities: [],

  setClientLastUpdated: (updatedAt: string) => {
    set({clientLastUpdated: updatedAt});
  },

  syncCommunitiesAndTimestamp: (clientLastUpdated: string) => {
    set({communities: useMapStore.getState().communities, clientLastUpdated});
  },

  getCommunitiesForGeoid: geoid => {
    return getCommunitiesForGeoidFromAssignments(get().communityAssignments, geoid);
  },

  getPrimaryCommunityForGeoid: geoid => {
    return getPrimaryCommunityForGeoidFromAssignments(get().communityAssignments, geoid);
  },

  assignGeoidsToCommunity: (geoidSet: Set<GDBPath>, community: Zone) => {
    const currentAssignments = get().communityAssignments;
    const newAssignments = deepCopyCommunityAssignments(currentAssignments);
    const mutatedCommunities = new Set<Zone>();

    geoidSet.forEach(geoid => {
      insertGeoidIntoCommunity(geoid, community, newAssignments);
      mutatedCommunities.add(community);
    });

    const currentTime = new Date().toISOString();
    const newCommunityLastUpdated = new Map(get().communityLastUpdated);
    mutatedCommunities.forEach(c => {
      newCommunityLastUpdated.set(c, currentTime);
    });

    // Clear accumulated assignments since we are now committing to this state
    set({
      communityAssignments: newAssignments,
      communityLastUpdated: newCommunityLastUpdated,
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      clientLastUpdated: currentTime,
    });

    const {mapDocument} = useMapStore.getState();
    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, newAssignments, currentTime);
    }
  },

  /** Paint-phase mutation; writes feature-state immediately and queues store updates. */
  mutateCommunityAssignments: (
    mapRef: MaplibreMap,
    features: Array<MapGeoJSONFeature>,
    community: Zone,
    mode: CoiPaintMode = 'brush'
  ) => {
    const {accumulatedAssignments, communityAssignments, communityLastUpdated} = get();
    const {setPaintedChanges} = useChartStore.getState();
    // We can access the inner state of the map in a more ergonomic way than the convenience method `getFeatureState`
    // the inner state here gives us access to { [sourceLayer]: { [id]: { ...stateProperties }}}
    // So, we get things like `zone` and `locked` and `broken` etc without needing to check a bunch of different places
    // Additionally, since `setFeatureState` happens synchronously, there is no guessing game of when the state updates
    const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    if (!featureStateCache) return;

    const popChanges: Record<number, number> = {};
    const editTime = new Date().toISOString();

    features.forEach(feature => {
      const id = feature?.id?.toString();
      const sourceLayer = feature.properties?.__sourceLayer || feature.sourceLayer;
      if (!id || !sourceLayer) return;

      const currentFeatureState = featureStateCache[sourceLayer]?.[id] || {};
      if (accumulatedAssignments.has(id) || currentFeatureState?.locked) return;

      const currentCommunities = getCommunitiesForGeoidFromAssignments(communityAssignments, id);
      const newCommunities = new Set(currentCommunities);
      let mutationType: CoiAccumulatedMutation | null = null;

      if (mode === 'eraser') {
        if (!currentCommunities.has(community)) return; // Not part of this community, nothing to erase
        mutationType = {type: 'erase-community', community};
        newCommunities.delete(community);
      } else if (mode === 'brush') {
        if (currentCommunities.has(community)) return; // Already part of this community, nothing to do
        mutationType = {type: 'assign', community};
        newCommunities.add(community);
      } else {
        return; // Invalid mode
      }

      accumulatedAssignments.set(id, mutationType);

      const featurePop = parseInt(feature.properties?.total_pop_20 || '0', 10);
      if (!isNaN(featurePop)) {
        if (mutationType.type === 'assign') {
          popChanges[mutationType.community] =
            (popChanges[mutationType.community] || 0) + featurePop;
          communityLastUpdated.set(mutationType.community, editTime);
        } else if (mutationType.type === 'erase-community') {
          popChanges[mutationType.community] =
            (popChanges[mutationType.community] || 0) - featurePop;
          communityLastUpdated.set(mutationType.community, editTime);
        }
      }

      mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        buildFeatureStateUpdateForCommunities(currentCommunities, newCommunities)
      );
    });

    set({
      accumulatedAssignments: new Map(accumulatedAssignments),
      communityLastUpdated: new Map(communityLastUpdated),
    });

    if (Object.keys(popChanges).length) {
      setPaintedChanges(popChanges);
    }
  },

  setAccumulatedAssignments: (assignments, communitiesUpdated) => {
    const newCommunityLastUpdated = new Map(get().communityLastUpdated);
    const currentTime = new Date().toISOString();
    communitiesUpdated.forEach(c => {
      newCommunityLastUpdated.set(c, currentTime);
    });
    set({
      accumulatedAssignments: new Map(assignments),
      communityLastUpdated: newCommunityLastUpdated,
    });
  },

  ingestAccumulatedAssignments: () => {
    const {
      accumulatedAssignments,
      communityAssignments,
      shatterIds,
      communityLastUpdated,
      parentToChild,
      childToParent,
    } = get();

    if (!accumulatedAssignments.size) return;

    const newAssignments = deepCopyCommunityAssignments(communityAssignments);
    const newLastUpdated = new Map(communityLastUpdated);
    const currentTime = new Date().toISOString();

    const changedGeoids = new Set<string>();
    const touchedCommunities = new Set<Zone>();

    accumulatedAssignments.forEach((mutation, geoid) => {
      changedGeoids.add(geoid);
      switch (mutation.type) {
        case 'assign':
          insertGeoidIntoCommunity(geoid, mutation.community, newAssignments);
          touchedCommunities.add(mutation.community);
          break;
        case 'erase-community':
          if (removeGeoidFromCommunity(newAssignments, geoid, mutation.community)) {
            touchedCommunities.add(mutation.community);
          }
          break;
        default:
          break;
      }
    });

    touchedCommunities.forEach(community => {
      newLastUpdated.set(community, currentTime);
    });

    const {mapDocument, getMapRef} = useMapStore.getState();
    const mapRef = getMapRef();
    if (mapRef && mapDocument) {
      changedGeoids.forEach(geoid => {
        const isChild = shatterIds.children.has(geoid);
        const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
        if (!sourceLayer) return;
        const currentCommunities = getCommunitiesForGeoidFromAssignments(
          communityAssignments,
          geoid
        );
        const newCommunities = getCommunitiesForGeoidFromAssignments(newAssignments, geoid);
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: geoid,
            sourceLayer,
          },
          buildFeatureStateUpdateForCommunities(currentCommunities, newCommunities)
        );
      });
    }
    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, newAssignments, currentTime);
    }

    set({
      communityAssignments: newAssignments,
      communityLastUpdated: newLastUpdated,
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      clientLastUpdated: currentTime,
      parentToChild: new Map(parentToChild),
      childToParent: new Map(childToParent),
      shatterIds: {
        parents: new Set(shatterIds.parents),
        children: new Set(shatterIds.children),
      },
    });

    healTouchedParentsIfEligible({
      affectedGeometries: changedGeoids,
      shatterIds,
      childToParent,
      healParentsIfAllChildrenInSameCommunities: get().healParentsIfAllChildrenInSameCommunities,
    });
  },

  healParentsIfAllChildrenInSameCommunities: parentIds => {
    const {
      shatterIds: currentShatterIds,
      parentToChild: currentParentToChild,
      childToParent: currentChildToParent,
      communityAssignments: currentCommunityAssignments,
      communityLastUpdated,
    } = get();
    const {mapDocument, getMapRef, captiveIds, focusFeatures} = useMapStore.getState();

    const newShatterIds = {
      parents: new Set(currentShatterIds.parents),
      children: new Set(currentShatterIds.children),
    };
    const parentToChild = cloneParentToChildMap(currentParentToChild);
    const childToParent = new Map(currentChildToParent);
    const communityAssignments = deepCopyCommunityAssignments(currentCommunityAssignments);

    const mapRef = getMapRef();
    let healed = false;

    const parentIdsToCheck = parentIds ? Array.from(parentIds) : Array.from(newShatterIds.parents);

    parentIdsToCheck.forEach(parentId => {
      if (!newShatterIds.parents.has(parentId)) return;
      const children = parentToChild.get(parentId);
      if (!children || !children.size) return;

      const childIds = Array.from(children);

      // Can only heal if all children have the same set of communities, so we compare against
      // the first child.
      const firstChildCommunities = getCommunitiesForGeoidFromAssignments(
        communityAssignments,
        childIds[0]
      );
      const canHeal = childIds.every(childId => {
        const childCommunities = getCommunitiesForGeoidFromAssignments(
          communityAssignments,
          childId
        );
        return areCommunitySetsEqual(firstChildCommunities, childCommunities);
      });
      if (!canHeal) return;

      const canonicalCommunities = new Set(firstChildCommunities);
      const prevParentCommunities = getCommunitiesForGeoidFromAssignments(
        communityAssignments,
        parentId
      );

      childIds.forEach(childId => {
        const prevChildCommunities = getCommunitiesForGeoidFromAssignments(
          communityAssignments,
          childId
        );
        removeGeoidFromAllCommunities(communityAssignments, childId);
        newShatterIds.children.delete(childId);
        childToParent.delete(childId);

        if (mapRef && mapDocument?.child_layer) {
          mapRef.setFeatureState(
            {
              source: BLOCK_SOURCE_ID,
              id: childId,
              sourceLayer: mapDocument.child_layer,
            },
            buildFeatureStateUpdateForCommunities(prevChildCommunities, new Set<Zone>())
          );
        }
      });

      removeGeoidFromAllCommunities(communityAssignments, parentId);
      canonicalCommunities.forEach(communityId => {
        insertGeoidIntoCommunity(parentId, communityId, communityAssignments);
      });
      parentToChild.delete(parentId);
      newShatterIds.parents.delete(parentId);

      if (mapRef && mapDocument?.parent_layer) {
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: parentId,
            sourceLayer: mapDocument.parent_layer,
          },
          {
            ...buildFeatureStateUpdateForCommunities(prevParentCommunities, canonicalCommunities),
            broken: false,
          }
        );
      }

      GeometryWorker?.removeGeometries(childIds);
      healed = true;
    });

    if (!healed) return;

    const currentTime = new Date().toISOString();
    set({
      communityAssignments,
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      communityLastUpdated: new Map(communityLastUpdated),
      shatterIds: newShatterIds,
      parentToChild,
      childToParent,
      clientLastUpdated: currentTime,
    });

    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, communityAssignments, currentTime, true);
    }

    const controlsState = useMapControlsStore.getState();
    const remainingCaptiveIds = new Set(
      Array.from(captiveIds).filter(id => newShatterIds.children.has(id))
    );
    const activeParentId = focusFeatures?.[0]?.id?.toString();
    const activeParentHealed = !!(activeParentId && !newShatterIds.parents.has(activeParentId));
    if (
      controlsState.activeTool !== 'shatter' &&
      captiveIds.size &&
      (activeParentHealed || remainingCaptiveIds.size === 0)
    ) {
      useMapStore.setState({
        captiveIds: new Set<string>(),
        focusFeatures: [],
      });
      controlsState.setMapOptions({mode: 'default'});
      return;
    }
    if (controlsState.activeTool !== 'shatter' && remainingCaptiveIds.size !== captiveIds.size) {
      useMapStore.setState({captiveIds: remainingCaptiveIds});
    }
  },

  ingestFromDocument: (data: CoiAssignmentsPayload, mapDocument?: DocumentObject) => {
    const currentTime = new Date().toISOString();
    const baselineUpdatedAt =
      mapDocument?.updated_at ?? useMapStore.getState().mapDocument?.updated_at ?? currentTime;

    // console.log('[hydration] ingestFromDocument called', {
    //   hasMapDocument: !!mapDocument,
    //   communityCount: data.communityAssignments.size,
    //   assignedCommunityIds: Array.from(data.communityAssignments.keys()),
    //   totalGeoIds: Array.from(data.communityAssignments.values()).reduce(
    //     (sum, s) => sum + s.size,
    //     0
    //   ),
    //   shatterParents: data.shatterIds.parents.size,
    //   shatterChildren: data.shatterIds.children.size,
    //   baselineUpdatedAt,
    // });

    if (mapDocument) {
      useMapStore.getState().mutateMapDocument(mapDocument);
    }

    const mapState = useMapStore.getState();
    const currentCommunities = mapState.communities;
    const assignedCommunityIds = Array.from(data.communityAssignments.keys()).sort(
      (left, right) => left - right
    );
    const currentCommunityIds = new Set(currentCommunities.map(community => community.id));
    const shouldReconstructCommunities =
      assignedCommunityIds.length > 0 &&
      ((!mapDocument?.community_metadata_list?.length && mapDocument !== undefined) ||
        !currentCommunities.length ||
        assignedCommunityIds.some(communityId => !currentCommunityIds.has(communityId)));

    // console.log('[hydration] Community reconstruction check', {
    //   shouldReconstructCommunities,
    //   assignedCommunityIds,
    //   currentCommunityIds: Array.from(currentCommunityIds),
    //   hasMetadataList: !!mapDocument?.community_metadata_list?.length,
    //   currentCommunitiesCount: currentCommunities.length,
    // });

    if (shouldReconstructCommunities) {
      const palette =
        mapDocument?.color_scheme ?? mapState.mapDocument?.color_scheme ?? DefaultColorScheme;
      const reconstructedCommunities = assignedCommunityIds.map((communityId, index) => ({
        id: communityId,
        render_order_id: index + 1,
        name: `Community ${index + 1}`,
        description: DEFAULT_COMMUNITY_DESCRIPTION,
        color: palette[communityId - 1] ?? palette[index % palette.length] ?? '#000000',
        createdAt: new Date(index * 1000).toISOString(),
        descriptionCommentId: null,
      }));
      // console.log('[hydration] Reconstructing communities:', reconstructedCommunities.length);
      mapState.setCommunities(reconstructedCommunities);
      // setCommunities marks metadata as dirty; clear it since this is
      // hydration from the server/IDB, not a user edit.
      mapState.clearUpdatedChanges();
    }

    set({
      communityAssignments: deepCopyCommunityAssignments(data.communityAssignments),
      communityVisibility: buildCommunityVisibilityMap(
        useMapStore.getState().communities.map(community => community.id),
        data.communityVisibility
      ),
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      communityLastUpdated: new Map<Zone, string>(),
      shatterIds: {
        parents: new Set(data.shatterIds.parents),
        children: new Set(data.shatterIds.children),
      },
      parentToChild: new Map<string, Set<string>>(data.parentToChild),
      childToParent: new Map<string, string>(data.childToParent),
      clientLastUpdated: baselineUpdatedAt,
      communities: useMapStore.getState().communities,
    });

    // console.log('[hydration] COI store updated, final state:', {
    //   communityAssignmentsSize: get().communityAssignments.size,
    //   clientLastUpdated: get().clientLastUpdated,
    // });

    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, data.communityAssignments, baselineUpdatedAt, true);
    }
  },

  replaceCommunityAssignments: (assignments: CommunityAssignmentsMap) => {
    const currentTime = new Date().toISOString();
    const newAssignments = deepCopyCommunityAssignments(assignments);
    set({
      communityAssignments: newAssignments,
      clientLastUpdated: currentTime,
    });

    const {mapDocument} = useMapStore.getState();
    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, newAssignments, currentTime);
    }
  },

  resetCommunityAssignments: () => {
    set({
      communityAssignments: new Map<Zone, Set<string>>(),
      communityLastUpdated: new Map<Zone, string>(),
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      clientLastUpdated: new Date().toISOString(),
      shatterIds: {
        parents: new Set<string>(),
        children: new Set<string>(),
      },
      parentToChild: new Map<string, Set<string>>(),
      childToParent: new Map<string, string>(),
    });
  },

  setShatterState: ({shatterIds, parentToChild, childToParent}) => {
    const newParentToChild: Map<string, Set<string>> = (() => {
      if (parentToChild.size > 0) {
        return new Map<string, Set<string>>(parentToChild);
      } else {
        const buildingParentToChild = new Map<string, Set<string>>();
        childToParent.forEach((parentId: string, childId: string) => {
          const existing = buildingParentToChild.get(parentId);
          if (existing) {
            existing.add(childId);
          } else {
            buildingParentToChild.set(parentId, new Set<string>([childId]));
          }
        });
        return buildingParentToChild;
      }
    })();

    const newChildToParent: Map<string, string> = (() => {
      if (childToParent.size > 0) {
        return new Map<string, string>(childToParent);
      } else {
        const buildingChildToParent = new Map<string, string>();
        parentToChild.forEach((childIds: Set<string>, parentId: string) => {
          childIds.forEach(childId => {
            buildingChildToParent.set(childId, parentId);
          });
        });
        return buildingChildToParent;
      }
    })();

    set({
      shatterIds: {
        parents: new Set(shatterIds.parents),
        children: new Set(shatterIds.children),
      },
      parentToChild: newParentToChild,
      childToParent: newChildToParent,
    });
  },

  resetShatterState: () => {
    set({
      shatterIds: {
        parents: new Set<string>(),
        children: new Set<string>(),
      },
      parentToChild: new Map<string, Set<string>>(),
      childToParent: new Map<string, string>(),
    });
  },

  removeCommunitiesAbove: (maxCommunity: number) => {
    const {communityAssignments, communityLastUpdated, shatterIds, childToParent} = get();
    const newAssignments = deepCopyCommunityAssignments(communityAssignments);
    const newLastUpdated = new Map(communityLastUpdated);
    const currTime = new Date().toISOString();

    const affectedGeometries = new Set<string>();

    newAssignments.forEach((geoids, community) => {
      if (community > maxCommunity) {
        geoids.forEach(geoid => {
          affectedGeometries.add(geoid);
        });
        newAssignments.delete(community);
        newLastUpdated.set(community, currTime);
      }
    });

    const {mapDocument, getMapRef} = useMapStore.getState();
    const mapRef = getMapRef();
    if (mapRef && mapDocument) {
      affectedGeometries.forEach(geoid => {
        const isChild = shatterIds.children.has(geoid);
        const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
        if (!sourceLayer) return;
        const prevCommunities = getCommunitiesForGeoidFromAssignments(communityAssignments, geoid);
        const newCommunities = getCommunitiesForGeoidFromAssignments(newAssignments, geoid);
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: geoid,
            sourceLayer,
          },
          buildFeatureStateUpdateForCommunities(prevCommunities, newCommunities)
        );
      });
    }
    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, newAssignments, currTime);
    }

    set({
      communityAssignments: newAssignments,
      communityLastUpdated: newLastUpdated,
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      clientLastUpdated: currTime,
      communities: useMapStore.getState().communities,
    });

    healTouchedParentsIfEligible({
      affectedGeometries,
      shatterIds,
      childToParent,
      healParentsIfAllChildrenInSameCommunities: get().healParentsIfAllChildrenInSameCommunities,
    });
  },

  removeCommunity: (removedCommunity: Zone) => {
    const {
      communityAssignments,
      communityLastUpdated,
      communityVisibility,
      shatterIds,
      childToParent,
    } = get();
    const newAssignments = deepCopyCommunityAssignments(communityAssignments);
    const affectedGeometries = new Set(newAssignments.get(removedCommunity) ?? []);
    newAssignments.delete(removedCommunity);
    const newLastUpdated = new Map(communityLastUpdated);
    newLastUpdated.delete(removedCommunity);
    const newVisibility = new Map(communityVisibility);
    newVisibility.delete(removedCommunity);
    const currTime = new Date().toISOString();

    const {mapDocument, getMapRef} = useMapStore.getState();
    const mapRef = getMapRef();
    if (mapRef && mapDocument) {
      affectedGeometries.forEach(geoid => {
        const isChild = shatterIds.children.has(geoid);
        const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
        if (!sourceLayer) return;
        const prevCommunities = getCommunitiesForGeoidFromAssignments(communityAssignments, geoid);
        const newCommunities = getCommunitiesForGeoidFromAssignments(newAssignments, geoid);
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: geoid,
            sourceLayer,
          },
          buildFeatureStateUpdateForCommunities(prevCommunities, newCommunities)
        );
      });
    }
    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, newAssignments, currTime);
    }

    set({
      communityAssignments: newAssignments,
      communityVisibility: newVisibility,
      communityLastUpdated: newLastUpdated,
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      clientLastUpdated: currTime,
      communities: useMapStore.getState().communities,
    });

    healTouchedParentsIfEligible({
      affectedGeometries,
      shatterIds,
      childToParent,
      healParentsIfAllChildrenInSameCommunities: get().healParentsIfAllChildrenInSameCommunities,
    });
  },

  handlePutAssignments: async (overwrite = false) => {
    // console.log('[COI save] handlePutAssignments called, overwrite:', overwrite);
    await idb.flushPendingUpdate();

    const {mapDocument, setMapLock, setErrorNotification, setShowSaveConflictModal} =
      useMapStore.getState();
    if (!mapDocument?.document_id || !mapDocument.updated_at) {
      // console.error('[COI save] Aborting save: missing document_id or updated_at', {
      //   document_id: mapDocument?.document_id,
      //   updated_at: mapDocument?.updated_at,
      // });
      return;
    }
    const idbDocument = await idb.getDocument(mapDocument.document_id);
    if (!idbDocument) {
      // console.error(
      //   '[COI save] Aborting save: IDB document not found for',
      //   mapDocument.document_id
      // );
      return;
    }
    setMapLock({isLocked: true, reason: 'Saving Coi assignment plan'});
    try {
      const documentForSave: DocumentObject = {
        ...idbDocument.document_metadata,
        ...mapDocument,
        document_comments:
          mapDocument.document_comments ?? idbDocument.document_metadata.document_comments,
      };

      const {communityAssignments, shatterIds, childToParent} = get();
      // console.log('[COI save] Sending save request', {
      //   document_id: documentForSave.document_id,
      //   communityCount: communityAssignments.size,
      //   commentCount: documentForSave.document_comments?.length ?? 0,
      //   overwrite,
      // });
      const assignmntsPostResponse = await putUpdateCoiAssignmentsAndVerify({
        mapDocument: documentForSave,
        communityAssignments,
        shatterIds,
        childToParent,
        overwrite,
      });

      if (
        !assignmntsPostResponse.ok &&
        assignmntsPostResponse.error === 'Document has been updated since the last update'
      ) {
        // console.warn('[COI save] Conflict detected:', assignmntsPostResponse.error);
        setShowSaveConflictModal(true);
      } else if (!assignmntsPostResponse.ok) {
        // console.error('[COI save] Save failed:', assignmntsPostResponse.error);
        setErrorNotification({
          message: assignmntsPostResponse.error,
          severity: 2,
        });
      } else if (assignmntsPostResponse.ok) {
        // console.log('[COI save] Save succeeded:', assignmntsPostResponse.response);
        setShowSaveConflictModal(false);
      }
    } finally {
      setMapLock(null);
    }
  },

  handleRevert: async (mapDocument: DocumentObject) => {
    const confirmedMapDocument = confirmMapDocumentUrlParameter(
      mapDocument.document_id,
      '/coi/edit'
    );
    const {setErrorNotification, setMapLock, initiateFlushMapState} = useMapStore.getState();
    await initiateFlushMapState();
    if (!confirmedMapDocument) {
      setErrorNotification({
        message:
          'The map you are trying to revert to is not the current map. Please refresh your page and try again.',
        severity: 2,
      });
      return;
    }
    setMapLock({isLocked: true, reason: 'Reverting map to last save.'});
    try {
      const documentResult = await fetchDocument(mapDocument.document_id, 'remote');
      if (!documentResult.ok) {
        setErrorNotification({
          message: 'Failed to fetch document. Please refresh your page and try again.',
          severity: 2,
        });
        return;
      }
      const data = formatCoiAssignmentsFromDocument(documentResult.response.assignments);
      get().ingestFromDocument(data, documentResult.response.document);
    } finally {
      setMapLock(null);
    }
  },

  resolveConflict: async (
    resolution: SyncConflictResolution,
    syncConflictInfo: SyncConflictInfo,
    options: ConflictResolutionOptions = {}
  ) => {
    const {onNavigate, onComplete, context = ConflictContext.Save} = options;
    const {setMapDocument, setMapLock, setShowSaveConflictModal} = useMapStore.getState();
    const dependencies: CoiConflictDependencies = {
      syncConflictInfo,
      store: get(),
      setMapDocument,
      setMapLock,
      onNavigate,
      onComplete,
    };

    setShowSaveConflictModal(false);
    switch (resolution) {
      case SyncConflictResolution.KeepLocal:
        await coiResolveKeepLocal(dependencies, context);
        break;
      case SyncConflictResolution.UseLocal:
        await coiResolveUseLocal(dependencies, context);
        break;
      case SyncConflictResolution.UseServer:
        await coiResolveUseServer(dependencies);
        break;
      case SyncConflictResolution.Fork:
        await coiResolveFork(dependencies);
        break;
      default: {
        const exhaustiveResolution: never = resolution;
        throw new Error(`Unhandled sync conflict resolution: ${exhaustiveResolution}`);
      }
    }
    onComplete?.();
  },

  handlePutAssignmentsConflict: async (
    resolution: SyncConflictResolution,
    sycnConflictInfo: SyncConflictInfo,
    options: ConflictResolutionOptions = {context: ConflictContext.Save}
  ) => {
    await get().resolveConflict(resolution, sycnConflictInfo, options);
  },
}));
