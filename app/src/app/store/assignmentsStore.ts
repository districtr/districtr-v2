import {create} from 'zustand';
import {NullableZone} from '../constants/types';
import {Zone, GDBPath} from '@constants/types';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyCache} from '../utils/demography/demographyCache';
import {idb} from '../utils/idb/idb';
import {useMapStore} from './mapStore';
import {BLOCK_SOURCE_ID} from '../constants/layers';
import {checkIfSameZone} from '../utils/map/checkIfSameZone';
import {postUpdateAssignments} from '../utils/api/apiHandlers/postUpdateAssignments';
import {
  formatAssignmentsFromDocument,
  formatAssignmentsFromState,
} from '../utils/map/formatAssignments';
import {getAssignments} from '../utils/api/apiHandlers/getAssignments';
import {MapGeoJSONFeature} from 'maplibre-gl';
import {useChartStore} from './chartStore';
import {useMapControlsStore} from './mapControlsStore';
import {subscribeWithSelector} from 'zustand/middleware';
import {postUpdateAssignmentsAndVerify} from '../utils/api/apiHandlers/postUpdateAssignmentsAndVerify';
import {DocumentObject} from '../utils/api/apiHandlers/types';
import {SyncConflictInfo, SyncConflictResolution} from '../utils/api/apiHandlers/fetchDocument';
import {createMapDocument} from '../utils/api/apiHandlers/createMapDocument';
import {gold} from '@radix-ui/colors';

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
  /** Mapping of parent ids to their shattered children */
  shatterMappings: Record<string, Set<string>>;
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
      shatterMappings: AssignmentsStore['shatterMappings'];
    },
    mapDocument?: DocumentObject
  ) => void;
  /** Replaces the entire assignment map (e.g. after loading from API) */
  replaceZoneAssignments: (assignments: Map<string, NullableZone>) => void;
  /** Clears all assignments and local caches */
  resetZoneAssignments: () => void;
  /** Replaces or merges shatter state */
  setShatterState: (
    state: Partial<Pick<AssignmentsStore, 'shatterIds' | 'shatterMappings'>>
  ) => void;
  /** Clears all shatter state */
  resetShatterState: () => void;
  handlePutAssignments: (overwrite?: boolean) => void;
  showSaveConflictModal: boolean;
  handlePutAssignmentsConflict: (
    resolution: SyncConflictResolution,
    conflict: SyncConflictInfo
  ) => void;
}

export type ZoneAssignmentsMap = AssignmentsStore['zoneAssignments'];

export const useAssignmentsStore = create<AssignmentsStore>()(
  subscribeWithSelector((set, get) => ({
    zoneAssignments: new Map(),
    zonesLastUpdated: new Map(),
    accumulatedAssignments: new Map<string, NullableZone>(),
    shatterIds: {
      parents: new Set<string>(),
      children: new Set<string>(),
    },
    shatterMappings: {},
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
    mutateZoneAssignments: (mapRef, features, zone) => {
      const {accumulatedAssignments, zonesLastUpdated, zoneAssignments} = get();
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
      set({
        zoneAssignments: new Map(data.zoneAssignments),
        shatterIds: data.shatterIds,
        shatterMappings: data.shatterMappings,
        clientLastUpdated: mapDocument?.updated_at ?? new Date().toISOString(),
      });
      GeometryWorker?.updateZones(Array.from(data.zoneAssignments.entries()));
      demographyCache.updatePopulations(data.zoneAssignments);
      mapDocument &&
        idb.updateIdbAssignments(mapDocument, data.zoneAssignments, mapDocument.updated_at);
    },
    ingestAccumulatedAssignments: () => {
      const {
        accumulatedAssignments,
        shatterIds: _shatterIds,
        shatterMappings: _shatterMappings,
        zoneAssignments: currentZoneAssignments,
        zonesLastUpdated,
      } = get();

      const {mapDocument, getMapRef, lockedFeatures} = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapDocument || !getMapRef || !accumulatedAssignments.size) return;

      const zoneAssignments = new Map(currentZoneAssignments);
      accumulatedAssignments.forEach((zone, geoid) => {
        zoneAssignments.set(geoid, zone);
      });

      const shatterIds = {
        parents: new Set(_shatterIds.parents),
        children: new Set(_shatterIds.children),
      };
      const shatterMappings: Record<string, Set<string>> = {
        ..._shatterMappings,
      };

      const taggedParents = new Set<string>();
      accumulatedAssignments.forEach((zone, geoid) => {
        if (shatterIds.children.has(geoid)) {
          const parentId = Object.entries(shatterMappings).find(([, children]) =>
            children.has(geoid)
          )?.[0];
          if (parentId) {
            taggedParents.add(parentId);
          }
        }
      });

      const healedParents: Array<{
        parentId: string;
        zone: NullableZone;
        children: Set<string>;
      }> = [];
      const parentsToQueue: string[] = [];

      taggedParents.forEach(parentId => {
        const children = shatterMappings[parentId];
        if (!children || !children.size) return;
        const {shouldHeal, zone} = checkIfSameZone(children, zoneAssignments);
        if (shouldHeal && zone != null) {
          healedParents.push({parentId, zone, children: new Set(children)});
        } else {
          parentsToQueue.push(parentId);
        }
      });

      const healedChildIds = new Set<string>();
      const healedParentIds = new Set<string>();
      const newLockedFeatures = new Set(lockedFeatures);

      healedParents.forEach(({parentId, zone, children}) => {
        healedParentIds.add(parentId);
        children.forEach(childId => {
          healedChildIds.add(childId);
          zoneAssignments.delete(childId);
          shatterIds.children.delete(childId);
          newLockedFeatures.delete(childId);
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
        delete shatterMappings[parentId];
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

      const zoneEntries = Array.from(zoneAssignments.entries());
      GeometryWorker?.updateZones(zoneEntries);
      demographyCache.updatePopulations(zoneAssignments);
      idb.updateIdbAssignments(mapDocument, zoneAssignments);

      set({
        zoneAssignments,
        accumulatedAssignments: new Map<string, NullableZone>(),
        shatterIds,
        shatterMappings,
        clientLastUpdated: new Date().toISOString(),
        zonesLastUpdated: new Map(zonesLastUpdated),
      });
    },

    replaceZoneAssignments: assignments => {
      set({
        zoneAssignments: new Map(assignments),
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
        shatterMappings: {},
      });
    },

    setShatterState: ({shatterIds, shatterMappings}) => {
      set(state => ({
        shatterIds: shatterIds
          ? {
              parents: new Set(shatterIds.parents),
              children: new Set(shatterIds.children),
            }
          : state.shatterIds,
        shatterMappings: shatterMappings
          ? Object.keys(shatterMappings).reduce<Record<string, Set<string>>>((acc, key) => {
              acc[key] = new Set(shatterMappings[key]);
              return acc;
            }, {})
          : state.shatterMappings,
      }));
    },

    resetShatterState: () => {
      set({
        shatterIds: {
          parents: new Set<string>(),
          children: new Set<string>(),
        },
        shatterMappings: {},
      });
    },

    handlePutAssignments: async (overwrite = false) => {
      const {zoneAssignments, shatterIds, shatterMappings} = get();
      const {mapDocument} = useMapStore.getState();
      if (!mapDocument?.document_id || !mapDocument.updated_at) return;
      const assignmentsPostResponse = await postUpdateAssignmentsAndVerify({
        mapDocument,
        zoneAssignments,
        shatterIds,
        shatterMappings,
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
          clientLastUpdated: assignmentsPostResponse.response!.updated_at,
        });
      }
    },
    showSaveConflictModal: false,
    handlePutAssignmentsConflict: async (resolution, conflict) => {
      switch (resolution) {
        case 'keep-local': {
          set({
            showSaveConflictModal: false,
          });
          break;
        }
        case 'use-local': {
          get().handlePutAssignments(true);
          break;
        }
        case 'use-server': {
          const remoteAssignments = await getAssignments(conflict.serverDocument);
          if (!remoteAssignments.ok) {
            throw new Error('Failed to get remote assignments');
          }
          const data = formatAssignmentsFromDocument(remoteAssignments.response);
          get().ingestFromDocument(
            {
              zoneAssignments: data.zoneAssignments,
              shatterIds: data.shatterIds,
              shatterMappings: data.shatterMappings,
            },
            conflict.serverDocument
          );
          set({
            showSaveConflictModal: false,
          });
          break;
        }
        case 'fork': {
          const createMapDocumentResponse = await createMapDocument(conflict.serverDocument);
          if (!createMapDocumentResponse.ok) {
            throw new Error('Failed to create map document');
          }
          const assignments = await idb.getDocument(conflict?.localDocument.document_id);
          if (!assignments) {
            throw new Error('No assignments found in IDB');
          }
          const data = formatAssignmentsFromDocument(assignments.assignments);
          const response = await postUpdateAssignmentsAndVerify({
            mapDocument: createMapDocumentResponse.response,
            zoneAssignments: data.zoneAssignments,
            shatterIds: data.shatterIds,
            shatterMappings: data.shatterMappings,
            overwrite: true,
          });
          if (!response.ok) {
            throw new Error('Failed to post assignments');
          }
          set({
            showSaveConflictModal: false,
          });
          // redirect to new map document
          history.pushState(
            null,
            '',
            `/map/edit/${createMapDocumentResponse.response.document_id}`
          );
        }
      }
    },
  }))
);

window.__assignmentsStore = useAssignmentsStore;
