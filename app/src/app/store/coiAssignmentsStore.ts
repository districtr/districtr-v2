import {GDBPath, NullableZone, Zone} from '@constants/types';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {Map as MaplibreMap, MapGeoJSONFeature} from 'maplibre-gl';
import {DocumentObject} from '../utils/api/apiHandlers/types';
import {useChartStore} from './chartStore';
import {useMapStore} from './mapStore';
import {idb} from '../utils/idb/idb';

// FIXME: This needs to be changed out for a undo/redo system
import {createWithDevWrapperAndSubscribe} from './middlewares';

export type CommunityAssignmentsMap = Map<Zone, Set<string>>;
export type CoiPaintMode = 'brush' | 'eraser';
export type CoiAccumulatedMutation =
  | {type: 'assign'; community: Zone}
  | {type: 'erase-community'; community: Zone}
  | {type: 'erase-all'};

export type CoiAssignmentsPayload = {
  communityAssignments: CommunityAssignmentsMap;
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

  /** Lookup helpers for rendering/UI. */
  getCommunitiesForGeoid: (geoid: string) => Set<Zone>;
  getPrimaryCommunityForGeoid: (geoid: string) => NullableZone;

  /** Immediate (non-accumulated) assignment updates. */
  assignGeoidsToCommunity: (geoidSet: Set<GDBPath>, community: NullableZone) => void;

  /** Paint-phase mutation; writes feature-state immediately and queues store updates. */
  mutateCommunityAssignments: (
    mapRef: MaplibreMap,
    features: Array<MapGeoJSONFeature>,
    community: NullableZone,
    mode?: CoiPaintMode
  ) => void;

  setAccumulatedAssignments: (
    assignments: CoiAssignmentsStore['accumulatedAssignments'],
    communitiesUpdated: Set<NullableZone>
  ) => void;

  /** Flushes accumulated paint updates into canonical store state. */
  ingestAccumulatedAssignments: () => void;

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
 * Returns the "primary" community that a given geoid is part of based on the community
 * assignments map. The primary community is defined as the one with the lowest zone number. If
 * the geoid is not part of any community, returns null.
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
  const communities = Array.from(getCommunitiesForGeoidFromAssignments(assignments, geoid));
  if (communities.length === 0) return null;
  // The "primary" community is the one with the lowest zone number
  return communities.reduce((primary, current) => {
    if (primary === null) return current;
    return current < primary ? current : primary;
  }, null as NullableZone);
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
  const nextPrimaryCommunity = newCommunities.size ? Math.max(...Array.from(newCommunities)) : null;
  const updatedKeys = new Set<Zone>([...prevCommunities, ...newCommunities]);
  const featureStateUpdate: Record<string, unknown> = {
    selected: nextPrimaryCommunity !== null,
    community: nextPrimaryCommunity,
    // The hightlight/background logic keys off the `zone` property, so we need that to be available
    zone: nextPrimaryCommunity,
  };
  // We also need to set a key for each community that was added or removed so that the feature
  // state update triggers a paint update for those communities
  updatedKeys.forEach(communityId => {
    featureStateUpdate[`community_${communityId}`] = newCommunities.has(communityId);
  });

  return featureStateUpdate;
};

// ==============================
// == Zustand store definition ==
// ==============================

export const useCoiAssignmentsStore = createWithDevWrapperAndSubscribe<CoiAssignmentsStore>(
  'Districtr COI Assignments Store'
)((set, get) => ({
  communityAssignments: new Map<Zone, Set<string>>(),
  communityLastUpdated: new Map<Zone, string>(),
  accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
  shatterIds: {
    parents: new Set<string>(),
    children: new Set<string>(),
  },
  parentToChild: new Map<string, Set<string>>(),
  childToParent: new Map<string, string>(),
  clientLastUpdated: new Date().toISOString(),

  setClientLastUpdated: (updatedAt: string) => {
    set({clientLastUpdated: updatedAt});
  },

  getCommunitiesForGeoid: geoid => {
    return getCommunitiesForGeoidFromAssignments(get().communityAssignments, geoid);
  },

  getPrimaryCommunityForGeoid: geoid => {
    return getPrimaryCommunityForGeoidFromAssignments(get().communityAssignments, geoid);
  },

  assignGeoidsToCommunity: (geoidSet: Set<GDBPath>, community: NullableZone) => {
    const currentAssignments = get().communityAssignments;
    const newAssignments = deepCopyCommunityAssignments(currentAssignments);
    const mutatedCommunities = new Set<NullableZone>();

    geoidSet.forEach(geoid => {
      if (community === null) {
        const communitiesContainingGeoid = removeGeoidFromAllCommunities(newAssignments, geoid);
        communitiesContainingGeoid.forEach(c => mutatedCommunities.add(c));
        return;
      }
      insertGeoidIntoCommunity(geoid, community, newAssignments);
      mutatedCommunities.add(community);
    });

    const currentTime = new Date().toISOString();
    const newCommunityLastUpdated = new Map(get().communityLastUpdated);
    mutatedCommunities.forEach(c => {
      if (c !== null) {
        newCommunityLastUpdated.set(c, currentTime);
      }
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
    community: NullableZone,
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
        if (community === null) {
          if (!currentCommunities.size) return; // No communities to erase from
          mutationType = {type: 'erase-all'};
          newCommunities.clear();
        } else {
          if (!currentCommunities.has(community)) return; // Not part of this community, nothing to erase
          mutationType = {type: 'erase-community', community};
          newCommunities.delete(community);
        }
      } else if (mode === 'brush') {
        if (community === null) return; // Can't assign to null community in brush mode
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
        } else if (mutationType.type === 'erase-all') {
          currentCommunities.forEach(c => {
            popChanges[c] = (popChanges[c] || 0) - featurePop;
            communityLastUpdated.set(c, editTime);
          });
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
      if (c !== null) {
        newCommunityLastUpdated.set(c, currentTime);
      }
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
        case 'erase-all':
          const communitiesRemovedFrom = removeGeoidFromAllCommunities(newAssignments, geoid);
          communitiesRemovedFrom.forEach(c => touchedCommunities.add(c));
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
  },

  ingestFromDocument: (data: CoiAssignmentsPayload, mapDocument?: DocumentObject) => {
    const currentTime = new Date().toISOString();

    if (mapDocument) {
      useMapStore.getState().mutateMapDocument(mapDocument);
    }

    set({
      communityAssignments: deepCopyCommunityAssignments(data.communityAssignments),
      accumulatedAssignments: new Map<string, CoiAccumulatedMutation>(),
      communityLastUpdated: new Map<Zone, string>(),
      shatterIds: {
        parents: new Set(data.shatterIds.parents),
        children: new Set(data.shatterIds.children),
      },
      parentToChild: new Map<string, Set<string>>(data.parentToChild),
      childToParent: new Map<string, string>(data.childToParent),
      clientLastUpdated: currentTime,
    });

    if (mapDocument) {
      idb.updateIdbCoiAssignments(mapDocument, data.communityAssignments, currentTime, true);
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
        childToParent.forEach((parentId, childId) => {
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
        parentToChild.forEach((childIds, parentId) => {
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
    const {communityAssignments, communityLastUpdated, shatterIds} = get();
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
    });
  },
}));
