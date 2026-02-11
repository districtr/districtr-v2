import { NullableZone } from '../constants/types';
import { DEFAULT_COMMUNITY_OPACITY } from '../constants/mapDefaults';
import { Zone, GDBPath } from '@constants/types';
import GeometryWorker from '../utils/GeometryWorker';
import { demographyCache } from '../utils/demography/demographyCache';
import { idb } from '../utils/idb/idb';
import { useMapStore } from './mapStore';
import { BLOCK_SOURCE_ID } from '../constants/layers';
import { checkIfSameZone } from '../utils/map/checkIfSameZone';
import { formatAssignmentsFromDocument } from '../utils/map/formatAssignments';
import { getAssignments } from '../utils/api/apiHandlers/getAssignments';
import { MapGeoJSONFeature } from 'maplibre-gl';
import { useChartStore } from './chartStore';
import { putUpdateAssignmentsAndVerify } from '../utils/api/apiHandlers/putUpdateAssignmentsAndVerify';
import { DocumentObject } from '../utils/api/apiHandlers/types';
import {
  fetchDocument,
  SyncConflictInfo,
  SyncConflictResolution,
} from '../utils/api/apiHandlers/fetchDocument';
import { createMapDocument } from '../utils/api/apiHandlers/createMapDocument';
import { createWithFullMiddlewares } from './middlewares';
import { confirmMapDocumentUrlParameter } from '../utils/map/confirmMapDocumentUrlParameter';
import { communityAssignments, resolveMaxCommunities } from '../utils/community/communityAssignments';
import {
  MixEntry,
  mixRgbaColors,
  parseHexColor,
  DEFAULT_COMMUNITY_MIX_TUNING,
} from '../utils/community/communityMix';
import { useMapControlsStore } from './mapControlsStore';
import type { LocalCommunityState } from '../utils/idb/idb';
import { makeCommunity } from './types';

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
  /** Updates community assignments for a set of painted features */
  mutateCommunityAssignments: (
    mapRef: maplibregl.Map,
    features: Array<MapGeoJSONFeature>,
    communityId: number,
    action: 'add' | 'remove'
  ) => void;
  /** Geoids touched during an in-progress community paint interaction */
  communityPaintedGeoids: Set<string>;
  /** Queue geoids for a mixed-color refresh */
  queueCommunityGeoids: (geoids: Iterable<string>) => void;
  /** Flush mixed community colors to the map after painting */
  flushCommunityAssignments: () => void;
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
    mapDocument?: DocumentObject,
    localCommunityState?: LocalCommunityState
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
  showSaveConflictModal: boolean;
  handlePutAssignmentsConflict: (
    resolution: SyncConflictResolution,
    conflict: SyncConflictInfo
  ) => void;
  /** Unified conflict resolution method that handles both save and load conflicts */
  resolveConflict: (
    resolution: SyncConflictResolution,
    conflict: SyncConflictInfo,
    options?: {
      onNavigate?: (documentId: string) => void;
      onComplete?: () => void;
      context?: 'save' | 'load';
    }
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
}

export type ZoneAssignmentsMap = AssignmentsStore['zoneAssignments'];

export const useAssignmentsStore = createWithFullMiddlewares<AssignmentsStore>(
  'Districtr Assignments Store'
)((set, get) => ({
  zoneAssignments: new Map(),
  zonesLastUpdated: new Map(),
  accumulatedAssignments: new Map<string, NullableZone>(),
  communityPaintedGeoids: new Set<string>(),
  shatterIds: {
    parents: new Set<string>(),
    children: new Set<string>(),
  },
  parentToChild: new Map<string, Set<string>>(),
  childToParent: new Map<string, string>(),
  clientLastUpdated: '',
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
  mutateZoneAssignments: (
    mapRef: maplibregl.Map,
    features: Array<MapGeoJSONFeature>,
    zone: NullableZone
  ): void => {
    const { accumulatedAssignments, zonesLastUpdated, zoneAssignments } = get();
    const { setPaintedChanges } = useChartStore.getState();
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
        { selected: true, zone: zone }
      );
    });
    setPaintedChanges(popChanges);
  },

  mutateCommunityAssignments: (
    mapRef: maplibregl.Map,
    features: Array<MapGeoJSONFeature>,
    communityId: number,
    action: 'add' | 'remove'
  ): void => {
    if (!features?.length) return;
    if (communityId < 0) return;
    const { communityPaintedGeoids } = get();
    const updated = new Set(communityPaintedGeoids);
    const {
      communityList,
      mapOptions: { communityOpacity },
    } = useMapControlsStore.getState();

    const baseAlpha = communityOpacity ?? DEFAULT_COMMUNITY_OPACITY;
    const { maxAlpha, slowPower, darkenStep, darkenCap } = DEFAULT_COMMUNITY_MIX_TUNING;

    const colorCache = new Map<number, MixEntry>();
    const visibleCommunityIds: number[] = [];
    let selectedCommunityVisible = false;
    let drawColor: string | null = null;

    for (const community of communityList) {
      if (community.id === communityId) {
        drawColor = community.color;
        selectedCommunityVisible = community.visible;
      }
      if (!community.visible) {
        continue;
      }

      visibleCommunityIds.push(community.id);
      const rgb = parseHexColor(community.color);
      if (!rgb) {
        continue;
      }
      const alpha = Math.max(0, Math.min(1, baseAlpha * community.opacity));
      if (alpha <= 0) {
        continue;
      }
      colorCache.set(community.id, { rgb, alpha });
    }

    // If the selected community is currently invisible, brush-add should be a no-op.
    // (Erase remains allowed to remove assignments.)
    if (action === 'add' && !selectedCommunityVisible) {
      return;
    }
    if (action === 'remove' && visibleCommunityIds.length === 0) {
      return;
    }

    const visibleCommunityMask =
      action === 'remove'
        ? communityAssignments.buildMaskForCommunityIds(visibleCommunityIds)
        : null;

    const mixFromAssignedIds = (assignedIds: number[]): string | null => {
      const colors: MixEntry[] = [];
      for (let i = 0; i < assignedIds.length; i++) {
        const entry = colorCache.get(assignedIds[i]);
        if (entry) {
          colors.push(entry);
        }
      }
      return mixRgbaColors(colors, {
        maxAlpha,
        slowPower,
        darkenStep,
        darkenCap,
        overlapCount: colors.length,
      });
    };

    const seen = new Set<string>();
    const remainingAssignmentsScratch: number[] = [];

    features.forEach(feature => {
      const id = feature?.id?.toString() ?? undefined;
      const sourceLayer = feature.properties.__sourceLayer || feature.sourceLayer;
      if (!id || !sourceLayer) return;

      const featureKey = `${sourceLayer}:${id}`;
      if (seen.has(featureKey)) return;
      seen.add(featureKey);

      if (action === 'add') {
        communityAssignments.addAssignment(id, communityId);
        updated.add(id);
        mapRef.setFeatureState(
          {
            source: BLOCK_SOURCE_ID,
            id,
            sourceLayer,
          },
          {
            community_draw: drawColor,
          }
        );
        return;
      }

      const eraseResult = communityAssignments.removeAssignmentsByMask(
        id,
        visibleCommunityMask!,
        remainingAssignmentsScratch
      );
      if (!eraseResult.changed) {
        return;
      }

      updated.add(id);
      mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {
          community_draw: null,
          community_mix: mixFromAssignedIds(eraseResult.remainingAssignments),
        }
      );
    });
    set({ communityPaintedGeoids: updated });
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

  queueCommunityGeoids: (geoids: Iterable<string>): void => {
    const { communityPaintedGeoids } = get();
    const updated = new Set(communityPaintedGeoids);
    for (const geoid of geoids) {
      updated.add(geoid);
    }
    set({ communityPaintedGeoids: updated });
  },

  flushCommunityAssignments: (): void => {
    const {
      communityPaintedGeoids,
      shatterIds,
      childToParent,
      parentToChild,
      zoneAssignments,
      healParentsIfAllChildrenInSameZone,
    } = get();
    if (communityPaintedGeoids.size <= 0) return;
    const mapRef = useMapStore.getState().getMapRef();
    const mapDocument = useMapStore.getState().mapDocument;
    let activeShatterIds = shatterIds;
    let activeZoneAssignments = zoneAssignments;
    let activeParentToChild = parentToChild;
    let activeChildToParent = childToParent;
    const geoidsToRepaint = new Set(communityPaintedGeoids);

    /*
     * Previous broader heal sweep (easy revert):
     * const parentsToCheck = new Set<string>(shatterIds.parents);
     */
    // Do not heal while actively in break mode; otherwise a fresh shatter can
    // immediately re-heal before the user paints.
    const shouldAttemptHeal = useMapControlsStore.getState().mapOptions.mode !== 'break';
    const parentsToCheck = new Set<string>();
    if (shouldAttemptHeal) {
      // Fast path: evaluate parents touched by currently painted child geoids.
      communityPaintedGeoids.forEach(geoid => {
        if (!shatterIds.children.has(geoid)) return;
        const parentId = childToParent.get(geoid);
        if (parentId) {
          parentsToCheck.add(parentId);
        }
      });

      // Include focused broken parent(s) to cover partial touched-id frames.
      const focusFeatures = useMapStore.getState().focusFeatures;
      focusFeatures.forEach(feature => {
        const parentId = feature.id?.toString();
        if (parentId && shatterIds.parents.has(parentId)) {
          parentsToCheck.add(parentId);
        }
      });

      // Fallback safety: if nothing was touched, run a full broken-parent sweep.
      if (!parentsToCheck.size && shatterIds.parents.size) {
        shatterIds.parents.forEach(parentId => parentsToCheck.add(parentId));
      }
    }

    if (shouldAttemptHeal && parentsToCheck.size) {
      const healResult = healParentsIfAllChildrenInSameZone(
        {
          _parentIds: parentsToCheck,
          _zoneAssignments: new Map(zoneAssignments),
          _parentToChild: new Map(parentToChild),
          _shatterIds: {
            parents: new Set(shatterIds.parents),
            children: new Set(shatterIds.children),
          },
          _childToParent: new Map(childToParent),
          _mapRef: mapRef,
          _mapDocument: mapDocument ?? undefined,
        },
        'refs'
      );
      if (healResult) {
        activeZoneAssignments = healResult.zoneAssignments;
        activeShatterIds = healResult.shatterIds;
        activeParentToChild = healResult.parentToChild;
        activeChildToParent = healResult.childToParent;
        parentsToCheck.forEach(parentId => {
          if (!activeShatterIds.parents.has(parentId)) {
            geoidsToRepaint.add(parentId);
          }
        });
      }
    }

    if (!mapRef || !mapDocument) {
      // Keep queued geoids so a later flush (when map refs are ready) can repaint.
      return;
    }

    const { communityList } = useMapControlsStore.getState();
    const baseAlpha =
      useMapControlsStore.getState().mapOptions.communityOpacity ?? DEFAULT_COMMUNITY_OPACITY;
    const { maxAlpha, slowPower, darkenStep, darkenCap } = DEFAULT_COMMUNITY_MIX_TUNING;
    const colorCache = new Map<number, MixEntry>();
    communityList.forEach(c => {
      if (!c.visible) return;
      const rgb = parseHexColor(c.color);
      if (!rgb) return;
      const alpha = Math.max(0, Math.min(1, baseAlpha * c.opacity));
      if (alpha <= 0) return;
      colorCache.set(c.id, { rgb, alpha });
    });

    geoidsToRepaint.forEach(geoid => {
      const assignedIds = communityAssignments.getAssignmentsForGeoid(geoid);
      const colors: MixEntry[] = [];
      for (let i = 0; i < assignedIds.length; i++) {
        const entry = colorCache.get(assignedIds[i]);
        if (entry) {
          colors.push(entry);
        }
      }
      const mixedColor = mixRgbaColors(colors, {
        maxAlpha,
        slowPower,
        darkenStep,
        darkenCap,
        overlapCount: colors.length,
      });
      const isChild = activeShatterIds.children.has(geoid);
      const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
      if (!sourceLayer) return;
      const targetFeature = {
        source: BLOCK_SOURCE_ID,
        id: geoid,
        sourceLayer,
      };
      const existingState = mapRef.getFeatureState(targetFeature) as
        | { community_mix?: string | null; community_draw?: string | null }
        | undefined;
      if (
        existingState?.community_mix === mixedColor &&
        (existingState?.community_draw ?? null) === null
      ) {
        return;
      }
      mapRef.setFeatureState(targetFeature, {
        community_mix: mixedColor,
        community_draw: null,
      });
    });

    const nowIso = new Date().toISOString();
    if (mapDocument) {
      // Keep persistence off the immediate render hot path.
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => {
          idb.updateIdbAssignments(mapDocument, activeZoneAssignments, nowIso);
        });
      } else {
        setTimeout(() => {
          idb.updateIdbAssignments(mapDocument, activeZoneAssignments, nowIso);
        }, 0);
      }
    }
    set({
      zoneAssignments: activeZoneAssignments,
      shatterIds: activeShatterIds,
      parentToChild: activeParentToChild,
      childToParent: activeChildToParent,
      communityPaintedGeoids: new Set<string>(),
      clientLastUpdated: nowIso,
      zonesLastUpdated: new Map(get().zonesLastUpdated),
    });
  },

  ingestFromDocument: (data, mapDocument, localCommunityState) => {
    const rawMax = mapDocument?.map_metadata?.max_communities;
    communityAssignments.reset({ maxCommunities: resolveMaxCommunities(rawMax) });
    if (localCommunityState?.assignments?.length) {
      localCommunityState.assignments.forEach(([geoid, communityIds]) => {
        communityIds.forEach(communityId => communityAssignments.addAssignment(geoid, communityId));
      });
    }
    const rehydratedCommunityGeoids = new Set(
      (localCommunityState?.assignments ?? []).map(([geoid]) => geoid)
    );
    const defaultCommunityList = [makeCommunity({ id: 0, displayPosition: 0 })];
    const nextCommunityList = localCommunityState?.communityList?.length
      ? localCommunityState.communityList
      : defaultCommunityList;
    const selectedExists = nextCommunityList.some(
      c => c.id === localCommunityState?.selectedCommunityId
    );
    const controlsState = useMapControlsStore.getState();
    const restoredCommunityOpacity = localCommunityState?.communityOpacity;
    useMapControlsStore.setState({
      communityList: nextCommunityList,
      selectedCommunityId: selectedExists ? localCommunityState!.selectedCommunityId : 0,
      mapOptions:
        typeof restoredCommunityOpacity === 'number'
          ? {
              ...controlsState.mapOptions,
              communityOpacity: restoredCommunityOpacity,
            }
          : controlsState.mapOptions,
    });
    set({
      zoneAssignments: new Map(data.zoneAssignments),
      shatterIds: data.shatterIds,
      parentToChild: new Map(data.parentToChild),
      childToParent: new Map(data.childToParent),
      communityPaintedGeoids: rehydratedCommunityGeoids,
      clientLastUpdated: mapDocument?.updated_at ?? new Date().toISOString(),
    });
    if (mapDocument) {
      // Save immediately when loading from document (not during painting)
      idb.updateIdbAssignments(mapDocument, data.zoneAssignments, mapDocument.updated_at, true);
      useMapStore.getState().mutateMapDocument(mapDocument);
    }
    demographyCache.updatePopulations(data.zoneAssignments);
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

    if (mutation === 'state' && (!mapRef || !mapDocument)) return;

    const healedParents: Array<{
      parentId: string;
      zone: NullableZone;
      children: Set<string>;
    }> = [];

    parentIds.forEach(parentId => {
      const children = parentToChild.get(parentId);
      if (!children || !children.size) return;
      const { shouldHeal, zone } = checkIfSameZone(children, zoneAssignments);
      const childList = Array.from(children);
      const sameCommunityAssignments =
        childList.length <= 1
          ? true
          : childList
            .slice(1)
            .every(childId => communityAssignments.haveSameAssignments(childList[0], childId));
      if (shouldHeal && sameCommunityAssignments) {
        healedParents.push({ parentId, zone, children: new Set(children) });
      }
    });

    const healedChildIds = new Set<string>();
    const healedParentIds = new Set<string>();

    healedParents.forEach(({ parentId, zone, children }) => {
      healedParentIds.add(parentId);
      communityAssignments.unionAssignments(children, parentId);
      children.forEach(childId => {
        healedChildIds.add(childId);
        zoneAssignments.delete(childId);
        shatterIds.children.delete(childId);
        childToParent.delete(childId);
        communityAssignments.releaseGeomByGeoid(childId);
        if (mapRef && mapDocument?.child_layer) {
          mapRef.setFeatureState(
            {
              source: BLOCK_SOURCE_ID,
              id: childId,
              sourceLayer: mapDocument.child_layer,
            },
            {
              zone: null,
              // Prevent stale child community paint from reappearing after re-shatter.
              community_mix: null,
              community_draw: null,
            }
          );
        }
      });
      parentToChild.delete(parentId);
      shatterIds.parents.delete(parentId);
      zoneAssignments.set(parentId, zone);
      if (mapRef && mapDocument?.parent_layer) {
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
      const { communityPaintedGeoids } = get();
      const queued = new Set(communityPaintedGeoids);
      healedParentIds.forEach(id => queued.add(id));
      communityAssignments.compactAssignedGeomIndices();
      set({
        zoneAssignments: new Map(zoneAssignments),
        accumulatedAssignments: new Map<string, NullableZone>(),
        shatterIds: {
          parents: new Set(shatterIds.parents),
          children: new Set(shatterIds.children),
        },
        parentToChild: new Map(parentToChild),
        childToParent: new Map(childToParent),
        communityPaintedGeoids: queued,
        clientLastUpdated: new Date().toISOString(),
        zonesLastUpdated: new Map(get().zonesLastUpdated),
      });
      get().flushCommunityAssignments();
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

    const { mapDocument, getMapRef } = useMapStore.getState();
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
    const { zoneAssignments, shatterIds, parentToChild, childToParent } = result;
    communityAssignments.compactAssignedGeomIndices();
    demographyCache.updatePopulations(zoneAssignments);
    idb.updateIdbAssignments(mapDocument, zoneAssignments);

    set({
      zoneAssignments,
      accumulatedAssignments: new Map<string, NullableZone>(),
      shatterIds,
      parentToChild,
      childToParent,
      clientLastUpdated: new Date().toISOString(),
      zonesLastUpdated: new Map(zonesLastUpdated),
    });
  },

  replaceZoneAssignments: assignments => {
    set({
      zoneAssignments: new Map(assignments),
    });
  },

  resetZoneAssignments: (): void => {
    const rawMax = useMapStore.getState().mapDocument?.map_metadata?.max_communities;
    communityAssignments.reset({ maxCommunities: resolveMaxCommunities(rawMax) });
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
      communityPaintedGeoids: new Set<string>(),
    });
  },

  setShatterState: ({ shatterIds, parentToChild, zoneAssignments, childToParent }) => {
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

  handlePutAssignments: async (overwrite = false) => {
    // Flush any pending IDB updates before explicit save
    await idb.flushPendingUpdate();

    const { zoneAssignments, shatterIds, parentToChild, childToParent } = get();
    const { mapDocument, setMapLock } = useMapStore.getState();
    if (!mapDocument?.document_id || !mapDocument.updated_at) return;
    const idbDocument = await idb.getDocument(mapDocument?.document_id);
    if (!idbDocument) return;
    setMapLock({ isLocked: true, reason: 'Saving plan' });
    const assignmentsPostResponse = await putUpdateAssignmentsAndVerify({
      mapDocument: idbDocument.document_metadata,
      zoneAssignments,
      shatterIds,
      parentToChild,
      childToParent,
      overwrite,
    });
    if (
      !assignmentsPostResponse.ok &&
      assignmentsPostResponse.error === 'Document has been updated since the last update'
    ) {
      set({
        showSaveConflictModal: true,
      });
    } else if (!assignmentsPostResponse.ok) {
      throw new Error(assignmentsPostResponse.error);
    } else if (assignmentsPostResponse.ok) {
      set({
        showSaveConflictModal: false,
      });
    }
    setMapLock(null);
  },
  handleRevert: async (mapDocument: DocumentObject) => {
    // before doing this operation
    const confirmedMapDocument = confirmMapDocumentUrlParameter(mapDocument.document_id);
    const { setErrorNotification, setMapLock } = useMapStore.getState();
    const { ingestFromDocument } = get();
    if (!confirmedMapDocument) {
      setErrorNotification({
        message:
          'The map you are trying to revert to is not the current map. Please refresh your page and try again.',
        severity: 2,
      });
      return;
    }
    setMapLock({ isLocked: true, reason: 'Reverting map to last save.' });
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
    setMapLock(null);
  },
  showSaveConflictModal: false,
  resolveConflict: async (resolution, conflict, options = {}) => {
    const { onNavigate, onComplete, context = 'save' } = options;
    const { setMapDocument, setMapLock, setAppLoadingState } = useMapStore.getState();
    const state = get();

    switch (resolution) {
      case 'keep-local': {
        if (context === 'load') {
          const assignments = await idb.getDocument(conflict.localDocument.document_id);
          if (!assignments) {
            throw new Error('No assignments found in IDB');
          }
          const data = formatAssignmentsFromDocument(assignments.assignments);
          setMapDocument(conflict.localDocument);
          state.ingestFromDocument(
            {
              zoneAssignments: data.zoneAssignments,
              shatterIds: data.shatterIds,
              parentToChild: data.parentToChild,
              childToParent: data.childToParent,
            },
            undefined,
            assignments.localCommunityState
          );
        }
        set({
          showSaveConflictModal: false,
        });
        onComplete?.();
        break;
      }
      case 'use-local': {
        set({
          showSaveConflictModal: false,
        });
        if (context === 'save') {
          // For save conflicts, use the existing handlePutAssignments with overwrite
          await state.handlePutAssignments(true);
        } else {
          // For load conflicts, upload local assignments to server
          setMapLock({ isLocked: true, reason: 'Loading local version, overwriting cloud version.' });
          setMapDocument(conflict.localDocument);
          const assignments = await idb.getDocument(conflict.localDocument.document_id);
          if (!assignments) {
            throw new Error('No assignments found in IDB');
          }
          const data = formatAssignmentsFromDocument(assignments.assignments);
          state.ingestFromDocument(
            {
              zoneAssignments: data.zoneAssignments,
              shatterIds: data.shatterIds,
              parentToChild: data.parentToChild,
              childToParent: data.childToParent,
            },
            undefined,
            assignments.localCommunityState
          );
          const response = await putUpdateAssignmentsAndVerify({
            mapDocument: conflict.localDocument,
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            parentToChild: data.parentToChild,
            childToParent: data.childToParent,
            overwrite: true,
          });
          if (!response.ok) {
            throw new Error('Failed to post assignments');
          }
          state.setClientLastUpdated(response.response.updated_at);
          setMapLock(null);
        }
        onComplete?.();
        break;
      }
      case 'use-server': {
        set({
          showSaveConflictModal: false,
        });
        setMapLock({
          isLocked: true,
          reason: 'Loading cloud version, overwriting local version.',
        });
        const remoteAssignments = await getAssignments(conflict.serverDocument);
        if (!remoteAssignments.ok) {
          throw new Error('Failed to get remote assignments');
        }
        setMapDocument(conflict.serverDocument);
        const data = formatAssignmentsFromDocument(remoteAssignments.response);
        state.ingestFromDocument(
          {
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            parentToChild: data.parentToChild,
            childToParent: data.childToParent,
          },
          conflict.serverDocument
        );
        setMapLock(null);
        onComplete?.();
        break;
      }
      case 'fork': {
        set({
          showSaveConflictModal: false,
        });
        setMapLock({ isLocked: true, reason: 'Creating a new plan from your changes.' });
        const createMapDocumentResponse = await createMapDocument(conflict.serverDocument);
        if (!createMapDocumentResponse.ok) {
          throw new Error('Failed to create map document');
        }
        // Set the map document to the newly created one BEFORE uploading assignments
        // so that putUpdateAssignmentsAndVerify mutates the correct document
        setMapDocument(createMapDocumentResponse.response);
        const assignments = await idb.getDocument(conflict.localDocument.document_id);
        if (!assignments) {
          throw new Error('No assignments found in IDB');
        }
        const data = formatAssignmentsFromDocument(assignments.assignments);
        const response = await putUpdateAssignmentsAndVerify({
          mapDocument: createMapDocumentResponse.response,
          zoneAssignments: data.zoneAssignments,
          shatterIds: data.shatterIds,
          parentToChild: data.parentToChild,
          childToParent: data.childToParent,
          overwrite: true,
        });
        if (!response.ok) {
          throw new Error('Failed to post assignments');
        }
        // Update the map document with the server's updated_at timestamp
        setMapDocument({
          ...createMapDocumentResponse.response,
          updated_at: response.response.updated_at,
        });
        // Update clientLastUpdated to match server timestamp to avoid sync conflicts
        state.setClientLastUpdated(response.response.updated_at);
        // Ingest the assignments we just uploaded
        state.ingestFromDocument(
          {
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            parentToChild: data.parentToChild,
            childToParent: data.childToParent,
          },
          {
            ...createMapDocumentResponse.response,
            updated_at: response.response.updated_at,
          }
        );
        setMapLock(null);
        if (onNavigate) {
          onNavigate(createMapDocumentResponse.response.document_id);
        } else {
          // Fallback to history.pushState for save conflicts
          history.pushState(
            null,
            '',
            `/map/edit/${createMapDocumentResponse.response.document_id}`
          );
        }
        onComplete?.();
        break;
      }
    }
  },
  handlePutAssignmentsConflict: async (resolution, conflict) => {
    await get().resolveConflict(resolution, conflict, {
      context: 'save',
      onComplete: () => {
        // Additional save-specific completion logic if needed
      },
    });
  },
}));
