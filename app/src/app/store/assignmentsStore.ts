import {create} from 'zustand';
import {NullableZone} from '../constants/types';
import {DocumentObject, RemoteAssignmentsResponse} from '../utils/api/apiHandlers/types';
import {Zone, GDBPath} from '@constants/types';
import {useMapStore} from './mapStore';
import GeometryWorker from '../utils/GeometryWorker';
import {demographyCache} from '../utils/demography/demographyCache';
import {idb} from '../utils/idb/idb';
import {useDemographyStore} from './demography/demographyStore';
import {useUnassignFeaturesStore} from './unassignedFeatures';
interface AssignmentsStore {
  zoneAssignments: Map<string, NullableZone>; // geoid -> zone
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  accumulatedGeoids: Set<string>;
  setAccumulatedGeoids: (
    geoids: AssignmentsStore['accumulatedGeoids'],
    zonesUpdated: Set<NullableZone>
  ) => void;
  ingestAccumulatedGeoids: () => void;
  loadZoneAssignments: (assignmentsData: RemoteAssignmentsResponse) => void;
  resetZoneAssignments: () => void;
  zonesLastUpdated: Map<Zone, string>;
  /**
   * Current map that the user is working on
   */
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
}

export const useAssignmentsStore = create<AssignmentsStore>((set, get) => ({
  zoneAssignments: new Map(),
  setZoneAssignments: (zone, geoids) => {
    const zoneAssignments = get().zoneAssignments;
    const newZoneAssignments = new Map(zoneAssignments);
    geoids.forEach(geoid => {
      newZoneAssignments.set(geoid, zone);
    });
    set({
      zoneAssignments: newZoneAssignments,
      accumulatedGeoids: new Set<string>(),
    });
  },
  accumulatedGeoids: new Set<string>(),
  setAccumulatedGeoids: (accumulatedGeoids, zonesUpdated) => {
    const {zonesLastUpdated} = get();
    zonesUpdated.forEach(zone => {
      zonesLastUpdated.set(zone, new Date().toISOString());
    });
    set({
      accumulatedGeoids: new Set(accumulatedGeoids),
      zonesLastUpdated: new Map(zonesLastUpdated),
    });
  },
  ingestAccumulatedGeoids: () => {
    const {accumulatedGeoids, mapDocument} = get();
    if (mapDocument) {
      const zoneAssignments = get().zoneAssignments;
      accumulatedGeoids.forEach(geoid => {
        zoneAssignments.set(geoid, null);
      });

      const zoneEntries = Array.from(zoneAssignments.entries());
      GeometryWorker?.updateZones(zoneEntries);
      demographyCache.updatePopulations(zoneAssignments);
      idb.updateIdbAssignments(mapDocument, zoneAssignments);
    }
  },
  zoneAssignments: new Map(),
  zonesLastUpdated: new Map(),

  loadZoneAssignments: assignmentsData => {
    useMapStore.temporal.getState().clear();
    const assignments = assignmentsData.assignments;
    const zoneAssignments = new Map<string, number>();
    const shatterIds = {
      parents: new Set<string>(),
      children: new Set<string>(),
    };
    const shatterMappings: MapStore['shatterMappings'] = {};

    assignments.forEach(assignment => {
      zoneAssignments.set(assignment.geo_id, assignment.zone);
      // preload last sent assignments with last fetched assignments
      if (assignment.parent_path) {
        if (!shatterMappings[assignment.parent_path]) {
          shatterMappings[assignment.parent_path] = new Set([assignment.geo_id]);
        } else {
          shatterMappings[assignment.parent_path].add(assignment.geo_id);
        }
        shatterIds.parents.add(assignment.parent_path);
        shatterIds.children.add(assignment.geo_id);
      }
    });
    set({
      zoneAssignments,
      shatterIds,
      shatterMappings,
      appLoadingState: 'loaded',
    });
  },
  resetZoneAssignments: () => set({zoneAssignments: new Map()}),

  mapDocument: null,
  setMapDocument: mapDocument => {
    demographyCache.clear();
    const {
      mapDocument: currentMapDocument,
      activeTool: currentActiveTool,
      resetZoneAssignments,
      upsertUserMap,
      allPainted,
      mapOptions,
    } = get();
    const idIsSame = currentMapDocument?.document_id === mapDocument.document_id;
    const accessIsSame = currentMapDocument?.access === mapDocument.access;
    const statusIsSame = currentMapDocument?.status === mapDocument.status;
    const documentIsSame = idIsSame && accessIsSame && statusIsSame;
    const bothHaveData =
      typeof currentMapDocument?.updated_at === 'string' &&
      typeof mapDocument?.updated_at === 'string';
    const remoteIsNewer = bothHaveData && currentMapDocument.updated_at! < mapDocument.updated_at!;
    if (documentIsSame && !remoteIsNewer) {
      return;
    }

    const initialMapOptions = useMapStore.getInitialState().mapOptions;
    if (currentMapDocument?.tiles_s3_path !== mapDocument.tiles_s3_path) {
      GeometryWorker?.clear();
      GeometryWorker?.resetZones();
    } else {
      GeometryWorker?.resetZones();
    }
    allPainted.clear();
    demographyCache.clear();
    resetZoneAssignments();
    useDemographyStore.getState().clear();
    useUnassignFeaturesStore.getState().reset();
    set({
      mapDocument: mapDocument,
      mapOptions: {
        ...initialMapOptions,
        bounds: mapDocument.extent,
        currentStateFp:
          currentMapDocument?.parent_layer === mapDocument?.parent_layer
            ? mapOptions.currentStateFp
            : undefined,
      },
      mapStatus: {
        status: mapDocument.status,
        access: mapDocument.access,
        genesis: mapDocument.genesis,
        token: mapDocument.token,
        password: mapDocument.password,
      },
      activeTool: mapDocument.access === 'edit' ? currentActiveTool : undefined,
      colorScheme: extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        mapDocument.num_districts ?? FALLBACK_NUM_DISTRICTS
      ),
      sidebarPanels: ['population'],
      appLoadingState: mapDocument?.genesis === 'copied' ? 'loaded' : 'initializing',
      mapRenderingState:
        mapDocument.tiles_s3_path === currentMapDocument?.tiles_s3_path ? 'loaded' : 'loading',
      shatterIds: {parents: new Set(), children: new Set()},
    });
  },
}));
