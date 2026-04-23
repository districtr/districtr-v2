import {ConflictResolutionOptions, NullableZone, SyncConflictResolution} from '../constants/types';
import {Zone, GDBPath} from '@constants/types';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyService} from '../utils/demography/demographyService';
import {idb} from '../utils/idb/idb';
import {useMapStore} from './mapStore';
import {useDemographyStore} from './demography/demographyStore';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {ConflictContext} from '../constants/types';
import {checkIfSameZone} from '../utils/map/checkIfSameZone';
import {formatAssignmentsFromDocument} from '../utils/map/formatAssignments';
import {getAssignments} from '../utils/api/apiHandlers/getAssignments';
import {MapGeoJSONFeature} from 'maplibre-gl';
import {useChartStore} from './chartStore';
import {putUpdateAssignmentsAndVerify} from '../utils/api/apiHandlers/putUpdateAssignmentsAndVerify';
import {DocumentObject} from '../utils/api/apiHandlers/types';
import {fetchDocument, SyncConflictInfo} from '../utils/api/apiHandlers/fetchDocument';
import {createMapDocument} from '../utils/api/apiHandlers/createMapDocument';
import {createWithFullMiddlewares} from './middlewares';
import {confirmMapDocumentUrlParameter} from '../utils/map/confirmMapDocumentUrlParameter';
import {
  DocumentNotFoundError,
  DocumentCreationError,
  DocumentConflictResolutionError,
} from './errors';
import {temporalManager} from '../utils/temporal';
import {cloneTemporalSnapshot, AssignmentsTemporalSnapshot} from '../utils/temporalSnapshot';
import {assignmentsTemporalConfig} from './middlewareConfig';
import {exposeStoreToWindow as _exposeAssignmentsStore} from './exposeToWindow';

export interface AssignmentsStore {
  /** Map of geoid -> zone assignments currently in memory */
  zoneAssignments: Map<string, NullableZone>;
  /** Tracks the last time a zone was modified, keyed by zone id */
  zonesLastUpdated: Map<Zone, string>;
  /** Geoids touched during an in-progress paint interaction */
  accumulatedAssignments: Map<string, NullableZone>;
  /** Parent/child ids for shattered geometries */
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };

  mutateZoneAssignments: (
    mapRef: maplibregl.Map,
    features: Array<MapGeoJSONFeature>,
    zone: NullableZone
  ) => void;

  /** Bi-directional mapping of parent ids to their shattered children */
  parentToChild: Map<string, Set<string>>;
  /** Bi-directional mapping of child ids to their parent id for O(1) lookups */
  childToParent: Map<string, string>;

  /** Assigns the provided geoids to the given zone immediately */
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  /** Updates accumulated geoids as the user paints */
  setAccumulatedAssignments: (
    assignments: AssignmentsStore['accumulatedAssignments'],
    zonesUpdated: Set<NullableZone>
  ) => void;

  clientLastUpdated: string;
  /** Internal snapshot used to collapse shatter + first child paint into a single undo step */
  pendingShatterUndoState: AssignmentsTemporalSnapshot | null;
  setClientLastUpdated: (updated_at: string) => void;

  /** Flushes accumulated geoids to the worker & downstream caches */
  ingestAccumulatedAssignments: () => void;
  ingestFromDocument: (
    data: {
      zoneAssignments: AssignmentsStore['zoneAssignments'];
      shatterIds: AssignmentsStore['shatterIds'];
      parentToChild: AssignmentsStore['parentToChild'];
      childToParent: AssignmentsStore['childToParent'];
    },
    mapDocument?: DocumentObject
  ) => void;

  /** Replaces the entire assignment map (e.g. after loading from API) */
  replaceZoneAssignments: (assignments: Map<string, NullableZone>) => void;
  /** Clears all assignments and local caches */
  resetZoneAssignments: () => void;

  /** Replaces or merges shatter state */
  setShatterState: (
    state: Pick<
      AssignmentsStore,
      'shatterIds' | 'parentToChild' | 'zoneAssignments' | 'childToParent'
    >
  ) => void;

  /** Clears all shatter state */
  resetShatterState: () => void;
  handlePutAssignments: (overwrite?: boolean) => Promise<void>;
  handleRevert: (mapDocument: DocumentObject) => Promise<void>;
  handlePutAssignmentsConflict: (
    resolution: SyncConflictResolution,
    conflict: SyncConflictInfo,
    options?: Pick<ConflictResolutionOptions, 'onNavigate' | 'onComplete'>
  ) => void;
  /** Unified conflict resolution method that handles both save and load conflicts */
  resolveConflict: (
    resolution: SyncConflictResolution,
    conflict: SyncConflictInfo,
    options?: ConflictResolutionOptions
  ) => Promise<void>;
  healParentsIfAllChildrenInSameZone: (
    props: {
      _parentIds?: AssignmentsStore['shatterIds']['parents'];
      _zoneAssignments?: AssignmentsStore['zoneAssignments'];
      _parentToChild?: AssignmentsStore['parentToChild'];
      _shatterIds?: AssignmentsStore['shatterIds'];
      _childToParent?: AssignmentsStore['childToParent'];
      _mapRef?: maplibregl.Map;
      _mapDocument?: DocumentObject;
    },
    mutation: 'refs' | 'state'
  ) =>
    | {
        zoneAssignments: Map<string, NullableZone>;
        shatterIds: AssignmentsStore['shatterIds'];
        parentToChild: AssignmentsStore['parentToChild'];
        childToParent: AssignmentsStore['childToParent'];
      }
    | undefined;
  removeAssignmentsForZonesAbove: (maxZone: number) => void;
}

export type ZoneAssignmentsMap = AssignmentsStore['zoneAssignments'];

/**
 * Helper function to load assignments from IDB for a given document ID, used in conflict
 * resolution when the user opts to keep their local version. Fetches the document from IDB
 * and formats the assignments for ingestion into the store.
 *
 * @param documentId - The ID of the document whose assignments should be loaded from IDB.
 * @return A promise that resolves to the formatted assignments data ready for ingestion into the store.
 * @throws If no document is found in IDB for the given document ID.
 */
const loadLocalAssignments = async (documentId: string) => {
  const doc = await idb.getDocument(documentId);
  if (!doc) {
    throw new DocumentNotFoundError(`Document with id ${documentId} not found in IDB`);
  }
  return formatAssignmentsFromDocument(doc.assignments);
};

/** Shared dependencies for conflict resolution helpers. */
type ConflictDependencies = {
  syncConflictInfo: SyncConflictInfo;
  store: AssignmentsStore;
  setMapDocument: (doc: DocumentObject) => void;
  setMapLock: (lock: {isLocked: boolean; reason: string} | null) => void;
  onNavigate?: (documentId: string) => void;
};

/**
 * Resolves a sync conflict by keeping the local (IDB) version of the document without pushing
 * it to the server. In a "load" context this means the user chose to continue working with their
 * local edits and ignore the server state. In a "save" context this is a no-op because the local
 * state is already in memory.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 * @param context - Whether the conflict arose during a "save" or "load" operation.
 * @returns A promise that resolves once the local assignments have been ingested (load) or
 *   immediately (save).
 */
const resolveKeepLocal = async (
  {syncConflictInfo, store, setMapDocument}: ConflictDependencies,
  context: ConflictContext
) => {
  if (context === ConflictContext.Load) {
    setMapDocument(syncConflictInfo.localDocument);
    const data = await loadLocalAssignments(syncConflictInfo.localDocument.document_id);
    store.ingestFromDocument(data);
  }
};

/**
 * Resolves a sync conflict by treating the local (IDB) version as authoritative and overwriting
 * the server. In a "save" context this simply retries the save with the overwrite flag. In a
 * "load" context the local assignments are loaded from IDB, ingested into the store, and then
 * pushed to the server with overwrite enabled so the server reflects the local state.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 * @param context - Whether the conflict arose during a "save" or "load" operation.
 * @returns A promise that resolves once the local assignments have been saved to the server and
 *   the store's `clientLastUpdated` has been synced with the server's response timestamp.
 * @throws If the server rejects the assignment upload.
 */
const resolveUseLocal = async (
  {syncConflictInfo, store, setMapDocument, setMapLock}: ConflictDependencies,
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
    const data = await loadLocalAssignments(syncConflictInfo.localDocument.document_id);
    store.ingestFromDocument(data);
    const response = await putUpdateAssignmentsAndVerify({
      mapDocument: syncConflictInfo.localDocument,
      zoneAssignments: data.zoneAssignments,
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
 * Resolves a sync conflict by discarding local changes and replacing them with the server's
 * version. Fetches the latest assignments from the server, sets the server document as the
 * active document, and ingests the remote assignments into the store — effectively reverting
 * any local edits the user had made since the last successful save.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 * @returns A promise that resolves once the server assignments have been fetched and ingested.
 * @throws If the server assignment fetch fails.
 */
const resolveUseServer = async ({
  syncConflictInfo,
  store,
  setMapDocument,
  setMapLock,
}: ConflictDependencies) => {
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
    const data = formatAssignmentsFromDocument(remoteAssignments.response);
    store.ingestFromDocument(data, syncConflictInfo.serverDocument);
  } finally {
    setMapLock(null);
  }
};

/**
 * Resolves a sync conflict by creating a brand-new document (a "fork") and uploading the user's
 * local assignments to it. This preserves both the original server document (untouched) and the
 * user's local edits (saved under a new document ID). After the upload succeeds, the user is
 * navigated to the new document's edit URL via `onNavigate` or a fallback `history.pushState`.
 *
 * @param deps - Shared conflict resolution dependencies (conflict info, store state, map setters).
 *   `onNavigate` is used to redirect the user to the forked document's edit page if provided;
 *   otherwise falls back to `history.pushState`.
 * @returns A promise that resolves once the new document has been created, assignments uploaded,
 *   and navigation triggered.
 * @throws If document creation or assignment upload fails.
 */
const resolveFork = async ({
  syncConflictInfo,
  store,
  setMapDocument,
  setMapLock,
  onNavigate,
}: ConflictDependencies) => {
  setMapLock({isLocked: true, reason: 'Creating a new plan from local changes.'});
  try {
    const createMapDocumentResponse = await createMapDocument({
      districtr_map_slug: syncConflictInfo.serverDocument.districtr_map_slug,
      map_type: syncConflictInfo.serverDocument.map_type,
      copy_from_doc: syncConflictInfo.serverDocument.document_id,
    });
    if (!createMapDocumentResponse.ok) {
      throw new DocumentCreationError('Failed to create map document from assignments on server');
    }
    // Carry over any local comments (saved or in-flight) onto the new doc so the
    // fork reflects the user's latest state. comment_ids are stripped because the
    // server just duplicated comments onto the new doc with fresh ids.
    const localComments = (syncConflictInfo.localDocument.document_comments || []).map(c => ({
      zone: c.zone,
      text: c.text,
    }));
    const newDocWithLocalComments = {
      ...createMapDocumentResponse.response,
      document_comments: localComments,
    };
    setMapDocument(newDocWithLocalComments);
    const data = await loadLocalAssignments(syncConflictInfo.localDocument.document_id);
    const response = await putUpdateAssignmentsAndVerify({
      mapDocument: newDocWithLocalComments,
      zoneAssignments: data.zoneAssignments,
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
      ...newDocWithLocalComments,
      updated_at: response.response.updated_at,
    };
    setMapDocument(updatedDocument);
    store.setClientLastUpdated(response.response.updated_at);
    store.ingestFromDocument(data, updatedDocument);
    if (onNavigate) {
      onNavigate(createMapDocumentResponse.response.document_id);
    } else {
      history.pushState(null, '', `/map/edit/${createMapDocumentResponse.response.document_id}`);
    }
  } finally {
    setMapLock(null);
  }
};

export const useAssignmentsStore = createWithFullMiddlewares<AssignmentsStore>(
  'Districtr Assignments Store',
  assignmentsTemporalConfig
)((set, get) => ({
  zoneAssignments: new Map(),
  zonesLastUpdated: new Map(),
  accumulatedAssignments: new Map<string, NullableZone>(),
  shatterIds: {
    parents: new Set<string>(),
    children: new Set<string>(),
  },
  parentToChild: new Map<string, Set<string>>(),
  childToParent: new Map<string, string>(),
  clientLastUpdated: '',
  pendingShatterUndoState: null,
  setClientLastUpdated: (updated_at: string) => {
    set({
      clientLastUpdated: updated_at,
    });
  },
  setZoneAssignments: (zone, geoids) => {
    const updatedAssignments = new Map(get().zoneAssignments);
    geoids.forEach(geoid => {
      updatedAssignments.set(geoid, zone);
    });

    const zonesLastUpdated = new Map(get().zonesLastUpdated);
    const timestamp = new Date().toISOString();
    if (zone !== null) {
      zonesLastUpdated.set(zone, timestamp);
    }

    set({
      zoneAssignments: updatedAssignments,
      accumulatedAssignments: new Map<string, NullableZone>(),
      zonesLastUpdated,
    });
  },
  mutateZoneAssignments: (mapRef, features, zone) => {
    const {accumulatedAssignments, zonesLastUpdated} = get();
    const {setPaintedChanges} = useChartStore.getState();
    // We can access the inner state of the map in a more ergonomic way than the convenience method `getFeatureState`
    // the inner state here gives us access to { [sourceLayer]: { [id]: { ...stateProperties }}}
    // So, we get things like `zone` and `locked` and `broken` etc without needing to check a bunch of different places
    // Additionally, since `setFeatureState` happens synchronously, there is no guessing game of when the state updates
    const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    const featureStateChangesCache =
      mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.stateChanges;
    if (!featureStateCache) return;
    // PAINT
    const popChanges: Record<number, number> = {};
    zone !== null && (popChanges[zone] = 0);
    const timestamp = new Date().toISOString();
    zone && zonesLastUpdated.set(zone, timestamp);
    features?.forEach(feature => {
      const id = feature?.id?.toString() ?? undefined;
      const sourceLayer = feature.properties.__sourceLayer || feature.sourceLayer;
      if (!id || !sourceLayer) return;
      const state = featureStateCache[sourceLayer]?.[id];
      const stateChanges = featureStateChangesCache?.[sourceLayer]?.[id];
      const prevAssignment = stateChanges?.zone || state?.zone || false;
      const shouldSkip =
        accumulatedAssignments.has(id) || state?.['locked'] || prevAssignment === zone || false;
      if (shouldSkip) return;
      accumulatedAssignments.set(id, zone);
      zonesLastUpdated.set(prevAssignment, timestamp);
      // TODO: Tiles should have population values as numbers, not strings
      const popValue = parseInt(feature.properties?.total_pop_20);
      if (!isNaN(popValue)) {
        if (prevAssignment) {
          popChanges[prevAssignment] = (popChanges[prevAssignment] || 0) - popValue;
        }
        if (zone) {
          popChanges[zone] = (popChanges[zone] || 0) + popValue;
        }
      }
      mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {selected: true, zone: zone}
      );
    });
    setPaintedChanges(popChanges);
  },

  setAccumulatedAssignments: (accumulatedAssignments, zonesUpdated) => {
    const zonesLastUpdated = new Map(get().zonesLastUpdated);
    const timestamp = new Date().toISOString();
    zonesUpdated.forEach(zone => {
      if (zone !== null) {
        zonesLastUpdated.set(zone, timestamp);
      }
    });

    set({
      accumulatedAssignments: new Map(accumulatedAssignments),
      zonesLastUpdated,
    });
  },

  ingestFromDocument: (data, mapDocument) => {
    const baselineUpdatedAt =
      mapDocument?.updated_at ??
      useMapStore.getState().mapDocument?.updated_at ??
      new Date().toISOString();
    set({
      zoneAssignments: new Map(data.zoneAssignments),
      shatterIds: data.shatterIds,
      parentToChild: new Map(data.parentToChild),
      childToParent: new Map(data.childToParent),
      clientLastUpdated: baselineUpdatedAt,
      pendingShatterUndoState: null,
    });
    if (mapDocument) {
      // Save immediately when loading from document (not during painting)
      idb.updateIdbAssignments(mapDocument, data.zoneAssignments, mapDocument.updated_at, true);
      useMapStore.getState().mutateMapDocument(mapDocument);
    }
    demographyService.updatePopulations({
      zoneAssignments: data.zoneAssignments,
      coalitionGroups: useDemographyStore.getState().coalitionGroups,
    });
  },

  healParentsIfAllChildrenInSameZone: (
    {
      _parentIds,
      _zoneAssignments,
      _parentToChild,
      _shatterIds,
      _childToParent,
      _mapRef,
      _mapDocument,
    },
    mutation
  ) => {
    const state = get();
    const mapStoreState = useMapStore.getState();
    const parentIds = _parentIds ?? state.shatterIds.parents;
    const shatterIds = _shatterIds ?? state.shatterIds;
    const zoneAssignments = _zoneAssignments ?? state.zoneAssignments;
    const parentToChild = _parentToChild ?? new Map(state.parentToChild);
    const childToParent = _childToParent ?? new Map(state.childToParent);
    const mapRef = _mapRef ?? mapStoreState.getMapRef();
    const mapDocument = _mapDocument ?? mapStoreState.mapDocument;

    if (!mapRef || !mapDocument) return;

    const healedParents: Array<{
      parentId: string;
      zone: NullableZone;
      children: Set<string>;
    }> = [];

    parentIds.forEach(parentId => {
      const children = parentToChild.get(parentId);
      if (!children || !children.size) return;
      const {shouldHeal, zone} = checkIfSameZone(children, zoneAssignments);
      if (shouldHeal) {
        healedParents.push({parentId, zone, children: new Set(children)});
      }
    });

    const healedChildIds = new Set<string>();
    const healedParentIds = new Set<string>();

    healedParents.forEach(({parentId, zone, children}) => {
      healedParentIds.add(parentId);
      children.forEach(childId => {
        healedChildIds.add(childId);
        zoneAssignments.delete(childId);
        shatterIds.children.delete(childId);
        childToParent.delete(childId);
        if (mapRef && mapDocument.child_layer) {
          mapRef.setFeatureState(
            {
              source: BLOCK_SOURCE_ID,
              id: childId,
              sourceLayer: mapDocument.child_layer,
            },
            {
              zone: null,
            }
          );
        }
      });
      parentToChild.delete(parentId);
      shatterIds.parents.delete(parentId);
      zoneAssignments.set(parentId, zone);
      if (mapRef && mapDocument.parent_layer) {
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id: parentId,
            sourceLayer: mapDocument.parent_layer,
          },
          {
            broken: false,
            zone,
          }
        );
      }
      GeometryWorker?.removeGeometries(Array.from(children));
    });

    if (mutation === 'refs') {
      return {
        zoneAssignments,
        shatterIds,
        parentToChild,
        childToParent,
      };
    } else {
      set({
        zoneAssignments: new Map(zoneAssignments),
        accumulatedAssignments: new Map<string, NullableZone>(),
        shatterIds: {
          parents: new Set(shatterIds.parents),
          children: new Set(shatterIds.children),
        },
        parentToChild: new Map(parentToChild),
        childToParent: new Map(childToParent),
        clientLastUpdated: new Date().toISOString(),
        pendingShatterUndoState: null,
        zonesLastUpdated: new Map(get().zonesLastUpdated),
      });
    }
  },
  ingestAccumulatedAssignments: () => {
    const {
      accumulatedAssignments,
      shatterIds: _currShatterIds,
      parentToChild: _currParentToChild,
      childToParent: _currChildToParent,
      zoneAssignments: currentZoneAssignments,
      zonesLastUpdated,
      healParentsIfAllChildrenInSameZone,
    } = get();

    const {mapDocument, getMapRef} = useMapStore.getState();
    const isFocused = useMapStore.getState().captiveIds.size > 0;
    const mapRef = getMapRef();
    if (!mapDocument || !getMapRef || !accumulatedAssignments.size) return;

    const _zoneAssignments = new Map(currentZoneAssignments);
    accumulatedAssignments.forEach((zone, geoid) => {
      _zoneAssignments.set(geoid, zone);
    });

    const _shatterIds = {
      parents: new Set(_currShatterIds.parents),
      children: new Set(_currShatterIds.children),
    };
    const _parentToChild = new Map(_currParentToChild);

    const taggedParents = new Set<string>();
    !isFocused &&
      accumulatedAssignments.forEach((_, geoid) => {
        if (_currShatterIds.children.has(geoid)) {
          const parentId = _currChildToParent.get(geoid);
          if (parentId) {
            taggedParents.add(parentId);
          }
        }
      });

    const _childToParent = new Map(_currChildToParent);

    const result = healParentsIfAllChildrenInSameZone(
      {
        _parentIds: taggedParents,
        _zoneAssignments: _zoneAssignments,
        _parentToChild: _parentToChild,
        _shatterIds: _shatterIds,
        _childToParent: _childToParent,
        _mapRef: mapRef,
        _mapDocument: mapDocument,
      },
      'refs'
    );

    if (!result) return;
    const {zoneAssignments, shatterIds, parentToChild, childToParent} = result;
    demographyService.updatePopulations({
      zoneAssignments,
      coalitionGroups: useDemographyStore.getState().coalitionGroups,
    });
    idb.updateIdbAssignments(mapDocument, zoneAssignments);
    temporalManager.resume('districts');

    set({
      zoneAssignments,
      accumulatedAssignments: new Map<string, NullableZone>(),
      shatterIds,
      parentToChild,
      childToParent,
      clientLastUpdated: new Date().toISOString(),
      pendingShatterUndoState: null,
      zonesLastUpdated: new Map(zonesLastUpdated),
    });
  },

  replaceZoneAssignments: assignments => {
    set({
      zoneAssignments: new Map(assignments),
      pendingShatterUndoState: null,
    });
  },

  resetZoneAssignments: () => {
    set({
      zoneAssignments: new Map(),
      accumulatedAssignments: new Map<string, NullableZone>(),
      zonesLastUpdated: new Map(),
      shatterIds: {
        parents: new Set<string>(),
        children: new Set<string>(),
      },
      parentToChild: new Map<string, Set<string>>(),
      childToParent: new Map<string, string>(),
      pendingShatterUndoState: null,
    });
  },

  setShatterState: ({shatterIds, parentToChild, zoneAssignments, childToParent}) => {
    const {
      shatterIds: currShatterIds,
      parentToChild: currParentToChild,
      childToParent: currChildToParent,
      zoneAssignments: currZoneAssignments,
      clientLastUpdated,
    } = get();
    const preShatterSnapshot = cloneTemporalSnapshot({
      shatterIds: currShatterIds,
      parentToChild: currParentToChild,
      childToParent: currChildToParent,
      zoneAssignments: currZoneAssignments,
      clientLastUpdated,
    });

    // Ensure both maps are provided or build from each other
    const _parentToChild =
      parentToChild && parentToChild.size > 0
        ? new Map(parentToChild)
        : (() => {
            const map = new Map<string, Set<string>>();
            childToParent.forEach((parentId, childId) => {
              if (!map.has(parentId)) {
                map.set(parentId, new Set([childId]));
              } else {
                map.get(parentId)!.add(childId);
              }
            });
            return map;
          })();

    const _childToParent =
      childToParent && childToParent.size > 0
        ? new Map(childToParent)
        : (() => {
            const map = new Map<string, string>();
            parentToChild.forEach((children, parentId) => {
              children.forEach(childId => {
                map.set(childId, parentId);
              });
            });
            return map;
          })();

    set({
      shatterIds: {
        parents: new Set(shatterIds.parents),
        children: new Set(shatterIds.children),
      },
      parentToChild: _parentToChild,
      zoneAssignments: new Map(zoneAssignments),
      childToParent: _childToParent,
      pendingShatterUndoState: preShatterSnapshot,
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
      pendingShatterUndoState: null,
    });
  },

  removeAssignmentsForZonesAbove: maxZone => {
    const {zoneAssignments, zonesLastUpdated} = get();
    const {mapDocument, getMapRef} = useMapStore.getState();
    const mapRef = getMapRef();

    const updatedAssignments = new Map(zoneAssignments);
    const updatedZonesLastUpdated = new Map(zonesLastUpdated);
    const timestamp = new Date().toISOString();
    const removedGeoids: Array<{id: string; sourceLayer: string}> = [];

    // Remove assignments for zones above maxZone
    updatedAssignments.forEach((zone, geoid) => {
      if (zone !== null && zone > maxZone) {
        updatedAssignments.delete(geoid);
        updatedZonesLastUpdated.set(zone, timestamp);

        // Track geoids to clear on map
        if (mapDocument && mapRef) {
          const sourceLayer = mapDocument.child_layer || mapDocument.parent_layer;
          if (sourceLayer) {
            removedGeoids.push({id: geoid, sourceLayer});
          }
        }
      }
    });

    // Clear feature state on map
    if (mapRef && mapDocument) {
      removedGeoids.forEach(({id, sourceLayer}) => {
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id,
            sourceLayer,
          },
          {zone: null}
        );
      });
    }

    // Update IDB if document exists
    if (mapDocument) {
      idb.updateIdbAssignments(mapDocument, updatedAssignments, timestamp, true);
    }

    set({
      zoneAssignments: updatedAssignments,
      zonesLastUpdated: updatedZonesLastUpdated,
      accumulatedAssignments: new Map<string, NullableZone>(),
      pendingShatterUndoState: null,
    });
  },

  handlePutAssignments: async (overwrite = false) => {
    // Flush any pending IDB updates before explicit save
    await idb.flushPendingUpdate();

    const {mapDocument, setMapLock, setErrorNotification, setShowSaveConflictModal} =
      useMapStore.getState();
    if (!mapDocument?.document_id || !mapDocument.updated_at) return;
    const idbDocument = await idb.getDocument(mapDocument?.document_id);
    if (!idbDocument) return;
    setMapLock({isLocked: true, reason: 'Saving plan'});

    try {
      // Use mapStore.mapDocument (has latest comments from in-memory edits) merged with
      // idbDocument for fields that might only exist in IDB (e.g. from background sync).
      // document_comments must come from mapStore since IDB isn't updated on comment add/edit.
      const documentForSave: DocumentObject = {
        ...idbDocument.document_metadata,
        ...mapDocument,
        document_comments:
          mapDocument.document_comments ?? idbDocument.document_metadata.document_comments,
      };

      const {zoneAssignments, shatterIds, childToParent} = get();
      // Include color_scheme and num_districts in assignments update if they've changed
      const assignmentsPostResponse = await putUpdateAssignmentsAndVerify({
        mapDocument: documentForSave,
        zoneAssignments,
        shatterIds,
        childToParent,
        overwrite,
      });

      if (
        !assignmentsPostResponse.ok &&
        assignmentsPostResponse.error === 'Document has been updated since the last update'
      ) {
        setShowSaveConflictModal(true);
      } else if (!assignmentsPostResponse.ok) {
        setErrorNotification({
          message: assignmentsPostResponse.error,
          severity: 2,
        });
      } else if (assignmentsPostResponse.ok) {
        setShowSaveConflictModal(false);
      }
    } finally {
      setMapLock(null);
    }
  },
  handleRevert: async (mapDocument: DocumentObject) => {
    const confirmedMapDocument = confirmMapDocumentUrlParameter(mapDocument.document_id);
    const {setErrorNotification, setMapLock, initiateFlushMapState} = useMapStore.getState();
    await initiateFlushMapState();
    const {ingestFromDocument} = get();
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
      const data = formatAssignmentsFromDocument(documentResult.response.assignments);
      ingestFromDocument(data, documentResult.response.document);
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
    const {setMapDocument, setMapLock, setShowSaveConflictModal, setErrorNotification} =
      useMapStore.getState();
    const dependencies: ConflictDependencies = {
      syncConflictInfo,
      store: get(),
      setMapDocument,
      setMapLock,
      onNavigate,
    };

    setShowSaveConflictModal(false);

    // Wrap the whole switch so any resolver-helper failure (network error mid-Fork,
    // setMapDocument failing on malformed data, etc.) surfaces via the notification
    // system instead of becoming an unhandled promise rejection.
    try {
      switch (resolution) {
        case SyncConflictResolution.KeepLocal: {
          await resolveKeepLocal(dependencies, context);
          break;
        }
        case SyncConflictResolution.UseLocal: {
          await resolveUseLocal(dependencies, context);
          break;
        }
        case SyncConflictResolution.UseServer: {
          await resolveUseServer(dependencies);
          break;
        }
        case SyncConflictResolution.Fork: {
          await resolveFork(dependencies);
          break;
        }
        default: {
          const exhaustiveResolution: never = resolution;
          throw new Error(`Unhandled sync conflict resolution: ${exhaustiveResolution}`);
        }
      }
    } catch (error) {
      console.error('[resolveConflict] failed', {resolution, error});
      setErrorNotification({
        severity: 1,
        message: `Could not resolve save conflict: ${
          error instanceof Error ? error.message : String(error)
        }`,
        id: 'resolve-conflict-error',
      });
    }
    onComplete?.();
  },
  handlePutAssignmentsConflict: async (
    resolution: SyncConflictResolution,
    syncConflictInfo: SyncConflictInfo,
    options: Pick<ConflictResolutionOptions, 'onNavigate' | 'onComplete'> = {}
  ) => {
    await get().resolveConflict(resolution, syncConflictInfo, {
      context: ConflictContext.Save,
      ...options,
    });
  },
}));

_exposeAssignmentsStore('assignmentsStore', useAssignmentsStore);
