import {create} from 'zustand';
import {NullableZone} from '../constants/types';
import {Zone, GDBPath} from '@constants/types';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyCache} from '../utils/demography/demographyCache';
import {idb} from '../utils/idb/idb';
import {useMapStore} from './mapStore';
import {BLOCK_SOURCE_ID} from '../constants/layers';
import {checkIfSameZone} from '../utils/map/checkIfSameZone';
import {patchUnShatterParents} from '../utils/api/apiHandlers/patchUnShatterParents';

export interface AssignmentsStore {
  /** Map of geoid -> zone assignments currently in memory */
  zoneAssignments: Map<string, NullableZone>;
  /** Tracks the last time a zone was modified, keyed by zone id */
  zonesLastUpdated: Map<Zone, string>;
  /** Geoids touched during an in-progress paint interaction */
  accumulatedGeoids: Set<string>;
  /** Parent/child ids for shattered geometries */
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  /** Mapping of parent ids to their shattered children */
  shatterMappings: Record<string, Set<string>>;
  /** Assigns the provided geoids to the given zone immediately */
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  /** Updates accumulated geoids as the user paints */
  setAccumulatedGeoids: (
    geoids: AssignmentsStore['accumulatedGeoids'],
    zonesUpdated: Set<NullableZone>
  ) => void;
  /** Flushes accumulated geoids to the worker & downstream caches */
  ingestAccumulatedGeoids: () => void;
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
}

export type ZoneAssignmentsMap = AssignmentsStore['zoneAssignments'];

export const useAssignmentsStore = create<AssignmentsStore>((set, get) => ({
  zoneAssignments: new Map(),
  zonesLastUpdated: new Map(),
  accumulatedGeoids: new Set<string>(),
  shatterIds: {
    parents: new Set<string>(),
    children: new Set<string>(),
  },
  shatterMappings: {},

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
      accumulatedGeoids: new Set<string>(),
      zonesLastUpdated,
    });
  },

  setAccumulatedGeoids: (accumulatedGeoids, zonesUpdated) => {
    const zonesLastUpdated = new Map(get().zonesLastUpdated);
    const timestamp = new Date().toISOString();
    zonesUpdated.forEach(zone => {
      if (zone !== null) {
        zonesLastUpdated.set(zone, timestamp);
      }
    });

    set({
      accumulatedGeoids: new Set(accumulatedGeoids),
      zonesLastUpdated,
    });
  },

  ingestAccumulatedGeoids: () => {
    const {accumulatedGeoids, shatterIds, shatterMappings} = get();
    if (!accumulatedGeoids.size) return;

    const mapDocument = useMapStore.getState().mapDocument;
    if (!mapDocument) return;

    const mapState = useMapStore.getState();
    const mapRef = mapState.getMapRef?.();

    const currentZoneAssignments = get().zoneAssignments;
    const zoneAssignments = new Map(currentZoneAssignments);
    const updatedShatterIds = {
      parents: new Set(shatterIds.parents),
      children: new Set(shatterIds.children),
    };
    const updatedShatterMappings: Record<string, Set<string>> = {};
    Object.entries(shatterMappings).forEach(([parent, children]) => {
      updatedShatterMappings[parent] = new Set(children);
    });

    const taggedParents = new Set<string>();
    accumulatedGeoids.forEach(geoid => {
      if (updatedShatterIds.children.has(geoid)) {
        const parentId = Object.entries(updatedShatterMappings).find(([, children]) =>
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
      const children = updatedShatterMappings[parentId];
      if (!children || !children.size) return;
      const {shouldHeal, zone} = checkIfSameZone(children, currentZoneAssignments);
      if (shouldHeal && zone != null) {
        healedParents.push({parentId, zone, children: new Set(children)});
      } else {
        parentsToQueue.push(parentId);
      }
    });

    if (parentsToQueue.length) {
      mapState.checkParentsToHeal?.(parentsToQueue);
    }

    const healedChildIds = new Set<string>();
    const healedParentIds = new Set<string>();
    const newLockedFeatures = new Set(mapState.lockedFeatures);

    healedParents.forEach(({parentId, zone, children}) => {
      healedParentIds.add(parentId);
      children.forEach(childId => {
        healedChildIds.add(childId);
        zoneAssignments.delete(childId);
        updatedShatterIds.children.delete(childId);
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
      delete updatedShatterMappings[parentId];
      updatedShatterIds.parents.delete(parentId);
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

    const healedParentZoneGroups = new Map<Zone, string[]>();
    healedParents.forEach(({parentId, zone}) => {
      if (zone == null) return;
      const group = healedParentZoneGroups.get(zone) || [];
      group.push(parentId);
      healedParentZoneGroups.set(zone, group);
    });

    accumulatedGeoids.forEach(geoid => {
      if (healedChildIds.has(geoid) || healedParentIds.has(geoid)) {
        return;
      }
      zoneAssignments.set(geoid, null);
    });

    const zoneEntries = Array.from(zoneAssignments.entries());
    GeometryWorker?.updateZones(zoneEntries);
    demographyCache.updatePopulations(zoneAssignments);
    idb.updateIdbAssignments(mapDocument, zoneAssignments);

    set({
      zoneAssignments,
      accumulatedGeoids: new Set<string>(),
      shatterIds: updatedShatterIds,
      shatterMappings: updatedShatterMappings,
    });

    if (healedChildIds.size) {
      const timestamp = new Date().toISOString();
      const currentParentsToHeal = mapState.parentsToHeal?.filter(
        parentId => !healedParentIds.has(parentId)
      );
      useMapStore.setState({
        lockedFeatures: newLockedFeatures,
        assignmentsHash: timestamp,
        lastUpdatedHash: timestamp,
        parentsToHeal: currentParentsToHeal ?? mapState.parentsToHeal,
      });

      healedParentZoneGroups.forEach((parents, zone) => {
        if (!mapDocument?.document_id) return;
        const updateHash = new Date().toISOString();
        void patchUnShatterParents({
          geoids: parents,
          zone,
          document_id: mapDocument.document_id,
          updateHash,
        }).catch(error => {
          console.error('Failed to patch unshatter parents from ingestAccumulatedGeoids', error);
        });
      });
    }
  },

  replaceZoneAssignments: assignments => {
    set({
      zoneAssignments: new Map(assignments),
    });
  },

  resetZoneAssignments: () => {
    set({
      zoneAssignments: new Map(),
      accumulatedGeoids: new Set<string>(),
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
}));
