'use client';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import type {MapRef} from 'react-map-gl/maplibre';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import type {MapFeatureInfo} from '@constants/types';
import {Zone} from '@constants/types';
import {
  DistrictrMap,
  DocumentObject,
  DocumentMetadata,
  StatusObject,
} from '@utils/api/apiHandlers/types';
import maplibregl from 'maplibre-gl';
import type {MutableRefObject} from 'react';
import {QueryObserverResult} from '@tanstack/react-query';
import {ContextMenuState} from '@utils/map/types';
import {checkIfSameZone} from '@utils/map/checkIfSameZone';
import {resetZoneColors} from '@utils/map/resetZoneColors';
import {setZones} from '@utils/map/setZones';
import {patchReset} from '../utils/api/mutations';
import bbox from '@turf/bbox';
import {BLOCK_SOURCE_ID, FALLBACK_NUM_DISTRICTS} from '../constants/layers';
import {onlyUnique} from '../utils/arrays';
import {queryClient} from '../utils/api/queryClient';
import {useChartStore} from './chartStore';
import {createWithMiddlewares} from './middlewares';
import GeometryWorker from '../utils/GeometryWorker';
import {nanoid} from 'nanoid';
import {useUnassignFeaturesStore} from './unassignedFeatures';
import {demographyCache} from '../utils/demography/demographyCache';
import {useDemographyStore} from './demography/demographyStore';
import {extendColorArray} from '../utils/colors';
import {postGetChildEdges} from '../utils/api/apiHandlers/postGetChildEdges';
import {patchUnShatterParents} from '../utils/api/apiHandlers/patchUnShatterParents';
import {DEFAULT_MAP_OPTIONS, useMapControlsStore} from './mapControlsStore';
import {useAssignmentsStore} from './assignmentsStore';

const combineSetValues = (setRecord: Record<string, Set<unknown>>, keys?: string[]) => {
  const combinedSet = new Set<unknown>(); // Create a new set to hold combined values
  for (const key in setRecord) {
    if (setRecord.hasOwnProperty(key) && (!keys || keys?.includes(key))) {
      setRecord[key].forEach(value => combinedSet.add(value)); // Add each value to the combined set
    }
  }
  return combinedSet; // Return the combined set
};

export interface MapStore {
  // LOAD AND RENDERING STATE TRACKING
  appLoadingState: 'loaded' | 'initializing' | 'loading' | 'blurred';
  setAppLoadingState: (state: MapStore['appLoadingState']) => void;
  mapRenderingState: 'loaded' | 'initializing' | 'loading';
  setMapRenderingState: (state: MapStore['mapRenderingState']) => void;
  isTemporalAction: boolean;
  setIsTemporalAction: (isTemporal: boolean) => void;
  // MAP CANVAS REF AND CONTROLS
  getMapRef: () => maplibregl.Map | undefined;
  setMapRef: (map: MutableRefObject<MapRef | null>) => void;
  mapLock: boolean;
  setMapLock: (lock: boolean) => void;
  errorNotification: {
    message?: string;
    severity?: 1 | 2 | 3; // 1: dialog, 2: toast, 3: silent
    id?: string;
  };
  setErrorNotification: (errorNotification: MapStore['errorNotification']) => void;
  // MAP DOCUMENT
  /**
   * Available districtr views
   */
  mapViews: Partial<QueryObserverResult<DistrictrMap[], Error>>;
  setMapViews: (maps: MapStore['mapViews']) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  mapStatus: StatusObject | null;
  setMapStatus: (mapStatus: Partial<StatusObject>) => void;
  colorScheme: string[];
  setColorScheme: (colors: string[]) => void;

  // SHATTERING
  /**
   * A subset of IDs that a user is working on in a focused view.
   * When shattering, the view focuses on only the parent area,
   * and painting only occurs on the captive IDs.
   * Map render effects in `mapRenderSubs` -> `_applyFocusFeatureState`
   * Feature logic in `helpers` -> `getFeaturesInBbox`
   */
  captiveIds: Set<string>;
  /**
   * Leave the captive blocks view and return to the default painting mode.
   * @param {boolean} lock - On exit, optionally lock the features
   */
  exitBlockView: (lock?: boolean) => void;
  /**
   * Handles the business logic of fetching the child edges from the backend,
   * breaking the parent into its children, and then entering a focused work mode
   * to draw on just those areas.
   *
   * This function performs the following steps:
   * 1. Checks if there are any features to shatter.
   * 2. If features exist, it locks the map to prevent further modifications.
   * 3. Determines if the specified features are already shattered.
   * 4. If not, it sends a request to the backend to shatter the parent feature.
   * 5. Updates the state with the new child features and prepares the map for focused editing.
   *
   * @param {string} document_id - The ID of the document associated with the parent feature.
   * @param {Array<Partial<MapGeoJSONFeature>} features - An array of features to be shattered. Each feature should contain at least an ID and geometry.
   *
   * TODO: Multiple break/shatter is not yet implemented.
   */
  handleShatter: (document_id: string, features: Array<Partial<MapGeoJSONFeature>>) => void;
  /**
   * Sends unshatter patches to the server that remove the child assignments
   * and add parents under the specified zone.
   * This function processes the queue of parents to heal and updates the state accordingly.
   * This WILL NOT fire off if there is another server interaction happening (eg. assignment patch updates.)
   *
   * @param {string[]} [additionalIds] - Optional array of additional IDs to include in the healing process.
   */
  processHealParentsQueue: (additionalIds?: string[]) => void;
  silentlyShatter: (document_id: string, geoids: string[]) => Promise<void>;
  silentlyHeal: (document_id: string, parentsToHeal: MapStore['parentsToHeal']) => Promise<void>;
  /**
   * Removes local shatter data and updates the map view based on the provided parents to heal.
   * This function checks the current state of parents and determines if any need to be healed,
   * updating the relevant state and sending necessary requests to the server.
   *
   * @param {MapStore['parentsToHeal']} parentsToHeal - An array of additional parent IDs that need to be checked for healing.
   */
  checkParentsToHeal: (parentsToHeal: MapStore['parentsToHeal']) => void;
  /**
   * A list of parent IDs that are queued for healing.
   * This property tracks the parents that need to be processed for healing,
   * allowing the application to manage state effectively during the healing process.
   * Healing occurs on exit from break mode, or after a zone assignment update is complete
   * and the application is idle.
   *
   * @type {string[]}
   */
  parentsToHeal: string[];
  // LOCK
  // TODO: Refactor to something like this
  // featureStates: {
  //   locked: Array<MapFeatureInfo>,
  //   hovered: Array<MapFeatureInfo>,
  //   focused: Array<MapFeatureInfo>,
  //   highlighted: Array<MapFeatureInfo>
  // },
  // setFeatureStates: (
  //   features: Array<MapFeatureInfo>,
  //   state: keyof MapStore['featureStates'],
  //   action: "add" | "remove" | "toggle"
  // ) => void,
  // FOCUS
  /**
   * Parent IDs that a user is working on in break mode.
   * Map render effects in `mapRenderSubs` -> `_applyFocusFeatureState`
   */
  focusFeatures: Array<MapFeatureInfo>;
  /**
   * Map of ISO timestamps.
   * Keeps track of when a zone was last to keep track of when to refetch data
   */
  assignmentsHash: string;
  setAssignmentsHash: (hash: string) => void;
  lastUpdatedHash: string;
  workerUpdateHash: string;
  setWorkerUpdateHash: (hash: string) => void;
  handleReset: () => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // user id
  userID: string | null;
  setUserID: () => void;

  mapName: () => string | undefined;
  mapMetadata: DocumentObject['map_metadata'];
  updateMetadata: (
    metadata: Partial<DocumentMetadata>
  ) => void;
  // SHARE MAP
  passwordPrompt: boolean;
  setPasswordPrompt: (prompt: boolean) => void;
  password: string | null;
  setPassword: (password: string | null | undefined) => void;
  shareMapMessage: string | null;
  setShareMapMessage: (message: string | null) => void;
}

const initialLoadingState =
  typeof window !== 'undefined' &&
  (window.location.pathname.startsWith('/map/') ||
    window.location.pathname.startsWith('/map/edit/'))
    ? 'loading'
    : 'initializing';

export var useMapStore = createWithMiddlewares<MapStore>((set, get) => ({
  appLoadingState: initialLoadingState,
  setAppLoadingState: appLoadingState => set({appLoadingState}),
  mapRenderingState: 'initializing',
  setMapRenderingState: mapRenderingState => set({mapRenderingState}),
  isTemporalAction: false,
  setIsTemporalAction: (isTemporalAction: boolean) => set({isTemporalAction}),
  captiveIds: new Set<string>(),
  exitBlockView: (lock: boolean = false) => {
    const {focusFeatures} = get();
    const {healParentsIfAllChildrenInSameZone} = useAssignmentsStore.getState();
    const {setMapOptions} = useMapControlsStore.getState();

    set({
      captiveIds: new Set<string>(),
      focusFeatures: [],
    });
    setMapOptions({mode: 'default'});
    useMapControlsStore.setState({activeTool: 'shatter'});

    const parentId = focusFeatures?.[0].id?.toString();
    if (!parentId) return;
    healParentsIfAllChildrenInSameZone({}, 'state');
  },
  getMapRef: () => undefined,
  setMapRef: mapRef => {
    set({
      getMapRef: () => mapRef.current?.getMap(),
      appLoadingState: initialLoadingState === 'initializing' ? 'loaded' : get().appLoadingState,
    });
  },
  mapLock: false,
  setMapLock: mapLock => set({mapLock}),
  errorNotification: {},
  setErrorNotification: errorNotification => set({errorNotification}),
  mapViews: {isPending: true},
  setMapViews: mapViews => set({mapViews}),
  mapDocument: null,
  setMapDocument: mapDocument => {
    const currentMapDocument = get().mapDocument;
    const {resetZoneAssignments} = useAssignmentsStore.getState();
    const mapControlsState = useMapControlsStore.getState();

    const idIsSame = currentMapDocument?.document_id === mapDocument.document_id;
    const accessIsSame = currentMapDocument?.access === mapDocument.access;
    const documentIsSame = idIsSame && accessIsSame;
    const bothHaveData =
      typeof currentMapDocument?.updated_at === 'string' &&
      typeof mapDocument?.updated_at === 'string';
    const remoteIsNewer = bothHaveData && currentMapDocument.updated_at! < mapDocument.updated_at!;
    if (documentIsSame && !remoteIsNewer) {
      return;
    }

    if (currentMapDocument?.tiles_s3_path !== mapDocument.tiles_s3_path) {
      GeometryWorker?.clear();
    }
    GeometryWorker?.resetZones();
    demographyCache.clear();
    resetZoneAssignments();
    useDemographyStore.getState().clear();
    useUnassignFeaturesStore.getState().reset();

    useMapControlsStore.setState({
      mapOptions: {
        ...DEFAULT_MAP_OPTIONS,
        bounds: mapDocument.extent,
        currentStateFp:
          currentMapDocument?.parent_layer === mapDocument?.parent_layer
            ? mapControlsState.mapOptions.currentStateFp
            : undefined,
      },
      activeTool: mapDocument.access === 'edit' ? mapControlsState.activeTool : 'pan',
      selectedZone: 1,
      sidebarPanels: ['population'],
      isPainting: false,
      isEditing: mapDocument.access === 'edit',
    });

    useAssignmentsStore.getState().resetShatterState();

    set({
      mapDocument,
      mapStatus: {
        access: mapDocument.access,
        genesis: mapDocument.genesis,
        token: mapDocument.token,
        password: mapDocument.password,
      },
      colorScheme: extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        mapDocument.num_districts ?? FALLBACK_NUM_DISTRICTS
      ),
      captiveIds: new Set(),
      focusFeatures: [],
      parentsToHeal: [],
      mapLock: false,
      appLoadingState: mapDocument?.genesis === 'copied' ? 'loaded' : 'initializing',
      mapRenderingState:
        mapDocument.tiles_s3_path === currentMapDocument?.tiles_s3_path ? 'loaded' : 'loading',
      assignmentsHash: '',
      lastUpdatedHash: new Date().toISOString(),
      workerUpdateHash: new Date().toISOString(),
    });
  },
  mapStatus: null,
  setMapStatus: mapStatus => {
    const prev = get().mapStatus || {};
    set({mapStatus: {...prev, ...mapStatus} as StatusObject});
  },
  colorScheme: DefaultColorScheme,
  setColorScheme: colorScheme => set({colorScheme}),
  silentlyShatter: async (document_id, geoids) => {
    const {getMapRef, mapDocument} = get();
    const mapRef = getMapRef();
    if (!mapRef) return;
    set({mapLock: true});
    const updateHash = new Date().toISOString();
    // const r = await patchShatter.mutate({
    //   document_id,
    //   geoids,
    //   updateHash,
    // });
    geoids.forEach(geoid => {
      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: geoid,
          sourceLayer: mapDocument?.parent_layer,
        },
        {
          broken: true,
          zone: null,
        }
      );
    });
    set({mapLock: false, assignmentsHash: updateHash, lastUpdatedHash: updateHash});
  },
  silentlyHeal: async (document_id, parentsToHeal) => {
    const {getMapRef, mapDocument} = get();
    const {zoneAssignments, shatterMappings} = useAssignmentsStore.getState();
    const mapRef = getMapRef();
    if (!mapRef) return;
    set({mapLock: true});
    const updateHash = new Date().toISOString();
    const zone = zoneAssignments.get(parentsToHeal[0])!;
    const sourceLayer = mapDocument?.parent_layer;
    // const r = await patchUnShatter.mutate({
    //   geoids: parentsToHeal,
    //   zone: zoneAssignments.get(parentsToHeal[0])!,
    //   document_id,
    //   updateHash,
    // });
    const children = shatterMappings[parentsToHeal[0]];

    parentsToHeal.forEach(parent => {
      mapRef?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: parent,
          sourceLayer,
        },
        {
          broken: false,
          zone,
        }
      );
    });
    set({mapLock: false, assignmentsHash: updateHash, lastUpdatedHash: updateHash});
  },
  handleShatter: async (document_id, features) => {
    if (!features.length) {
      console.log('NO FEATURES');
      return;
    }
    set({mapLock: true});
    // set BLOCK_LAYER_ID based on features[0] to focused true

    const geoids = features.map(f => f.id?.toString()).filter(Boolean) as string[];
    const updateHash = new Date().toISOString();
    const {mapDocument, parentsToHeal} = get();
    const {
      shatterIds,
      shatterMappings: _shatterMappings,
      zoneAssignments: currentZoneAssignments,
      replaceZoneAssignments,
      setShatterState,
    } = useAssignmentsStore.getState();
    const {setMapOptions} = useMapControlsStore.getState();
    const edgesResult = await postGetChildEdges({
      document_id,
      geoids,
    });
    if (!edgesResult?.length) {
      set({
        errorNotification: {
          severity: 2,
          message: `Breaking this geography failed. Please refresh this page and try again. If this error persists, please share the error code below the Districtr team.`,
          id: `break-patchShatter-no-children-${mapDocument?.districtr_map_slug}-${mapDocument?.document_id}-geoid-${JSON.stringify(geoids)}`,
        },
      });
      return;
    }
    // TODO Need to return child edges even if the parent is already shattered
    // currently returns nothing
    let parents = new Set(shatterIds.parents);
    let children = new Set(shatterIds.children);
    let captiveIds = new Set<string>();
    let shatterMappings = Object.entries(_shatterMappings).reduce(
      (acc, [parent, children]) => {
        acc[parent] = new Set(children);
        return acc;
      },
      {} as Record<string, Set<string>>
    );
    const zoneAssignments = new Map(currentZoneAssignments);
    const zonesToSet: Record<string, Set<string>> = {};
    edgesResult.forEach(edge => {
      parents.add(edge.parent_path);
      children.add(edge.child_path);
      captiveIds.add(edge.child_path);
      if (!zonesToSet[edge.parent_path]) {
        zonesToSet[edge.parent_path] = new Set([edge.child_path]);
      } else {
        zonesToSet[edge.parent_path].add(edge.child_path);
      }

      if (!shatterMappings[edge.parent_path]) {
        shatterMappings[edge.parent_path] = new Set([edge.child_path]);
      } else {
        shatterMappings[edge.parent_path].add(edge.child_path);
      }
    });

    Object.entries(zonesToSet).forEach(([parent, children]) => {
      setZones(zoneAssignments, parent, children);
    });

    const featureBbox = features[0].geometry && bbox(features[0].geometry);
    const mapBbox =
      featureBbox?.length && featureBbox?.length >= 4
        ? (featureBbox.slice(0, 4) as maplibregl.LngLatBoundsLike)
        : undefined;

    setShatterState({
      shatterIds: {
        parents,
        children,
      },
      shatterMappings,
    });

    set({
      assignmentsHash: updateHash,
      lastUpdatedHash: updateHash,
      // TODO: Should this be true instead?
      // Is there a way to clean up the state history during
      // break / shatter?
      isTemporalAction: false,
      mapLock: false,
      captiveIds,
      focusFeatures: [
        {
          id: features[0].id,
          source: BLOCK_SOURCE_ID,
          sourceLayer: mapDocument?.parent_layer,
        },
      ],
      parentsToHeal: [...parentsToHeal, features?.[0]?.id?.toString() || '']
        .filter(onlyUnique)
        .filter(f => f.length),
    });
    replaceZoneAssignments(zoneAssignments);
    useMapControlsStore.setState({activeTool: 'brush'});
    setMapOptions({
      mode: 'break',
      bounds: mapBbox,
    });
  },
  parentsToHeal: [],
  processHealParentsQueue: async (additionalIds = []) => {
    const updateHash = new Date().toISOString();
    const {parentsToHeal: _parentsToHeal, mapDocument, mapLock, getMapRef} = get();
    const {isPainting} = useMapControlsStore.getState();
    const {shatterMappings, shatterIds, zoneAssignments, replaceZoneAssignments, setShatterState} =
      useAssignmentsStore.getState();
    const idsToCheck = [..._parentsToHeal, ...additionalIds];
    const mapRef = getMapRef();
    if (
      !mapRef ||
      isPainting ||
      mapLock ||
      !idsToCheck.length ||
      !mapDocument ||
      !mapDocument.child_layer ||
      queryClient.isMutating()
    ) {
      return;
    }
    const parentsToHeal = idsToCheck
      .filter(parentId => shatterMappings.hasOwnProperty(parentId))
      .map(parentId => ({
        parentId,
        ...checkIfSameZone(shatterMappings[parentId], zoneAssignments),
      }))
      .filter(f => f.shouldHeal);

    if (parentsToHeal.length) {
      set({mapLock: true});

      const healZone = parentsToHeal[0].zone;
      if (healZone == null) {
        set({mapLock: false});
        return;
      }

      const r = await patchUnShatterParents({
        geoids: parentsToHeal.map(f => f.parentId),
        zone: healZone,
        document_id: mapDocument.document_id,
        updateHash,
      });
      const children = parentsToHeal
        .map(f => ({
          parent: f.parentId,
          children: shatterMappings[f.parentId],
        }))
        .forEach(entry => {
          const {children, parent} = entry;
          GeometryWorker?.removeGeometries(Array.from(children));
        });
      const newZoneAssignments = new Map(zoneAssignments);
      const newShatterIds = {
        parents: new Set(shatterIds.parents),
        children: new Set(shatterIds.children),
      };
      const newShatterMappings: Record<string, Set<string>> = Object.entries(
        shatterMappings
      ).reduce(
        (acc, [key, value]) => {
          acc[key] = new Set(value);
          return acc;
        },
        {} as Record<string, Set<string>>
      );
      const childrenToRemove = parentsToHeal
        .map(f => newShatterMappings[f.parentId])
        .filter(Boolean) as Array<Set<string>>;

      childrenToRemove.forEach(childSet => {
        childSet.forEach(childId => {
          newZoneAssignments.delete(childId);
          newShatterIds.children.delete(childId);
          mapRef.setFeatureState(
            {
              id: childId,
              source: BLOCK_SOURCE_ID,
              sourceLayer: mapDocument.child_layer || '',
            },
            {
              zone: null,
            }
          );
        });
      });

      parentsToHeal.forEach(parent => {
        delete newShatterMappings[parent.parentId];
        newShatterIds.parents.delete(parent.parentId);
        newZoneAssignments.set(parent.parentId, parent.zone!);
      });
      setShatterState({
        shatterIds: newShatterIds,
        shatterMappings: newShatterMappings,
      });

      set({
        mapLock: false,
        isTemporalAction: false,
        lastUpdatedHash: updateHash,
        assignmentsHash: updateHash,
        // parents may have been added while this is firing off
        // get curernt, and filter for any that were removed by this event
        parentsToHeal: get().parentsToHeal.filter(f => !r.geoids.includes(f)),
      });
      replaceZoneAssignments(newZoneAssignments);
    }
  },
  checkParentsToHeal: parentsToHeal => {
    set({
      parentsToHeal: [...get().parentsToHeal, ...parentsToHeal].filter(onlyUnique),
    });
  },
  handleReset: async () => {
    const {mapDocument, getMapRef} = get();
    const {zoneAssignments, resetZoneAssignments, shatterIds, resetShatterState} =
      useAssignmentsStore.getState();
    const document_id = mapDocument?.document_id;

    if (!document_id) {
      console.log('No document ID to reset.');
      return;
    }
    set({
      mapLock: true,
      appLoadingState: 'loading',
    });
    const updateHash = new Date().toISOString();
    const resetResponse = await patchReset.mutate(document_id);

    if (resetResponse.document_id === document_id) {
      const initialState = useMapStore.getInitialState();
      useMapStore.temporal.getState().clear();
      GeometryWorker?.resetZones();
      resetZoneColors({
        zoneAssignments,
        mapRef: getMapRef(),
        mapDocument,
        shatterIds,
      });
      resetZoneAssignments();
      resetShatterState();

      set({
        appLoadingState: 'loaded',
        mapLock: false,
        colorScheme: DefaultColorScheme,
        assignmentsHash: updateHash,
        lastUpdatedHash: updateHash,
      });
      useMapControlsStore.setState({activeTool: 'pan'});
    }
  },
  focusFeatures: [],
  assignmentsHash: '',
  setAssignmentsHash: hash => set({assignmentsHash: hash}),
  lastUpdatedHash: new Date().toISOString(),
  workerUpdateHash: new Date().toISOString(),
  setWorkerUpdateHash: hash => set({workerUpdateHash: hash}),
  contextMenu: null,
  setContextMenu: contextMenu => set({contextMenu}),
  userID: null,
  setUserID: () => {
    set(state => {
      const userID = state.userID;
      if (userID === null) {
        return {userID: nanoid()};
      } else {
        return {userID};
      }
    });
  },
  mapName: () => get().mapDocument?.map_metadata?.name || undefined,
  mapMetadata: {
    name: null,
    tags: null,
    description: null,
    eventId: null,
    group: null,
    draft_status: null,
  },
  updateMetadata: (metadata) => {
    const {mapDocument} = get();
    set({
      mapDocument: {
        ...mapDocument,
        map_metadata: {
          ...mapDocument.map_metadata,
          ...metadata,
        },
      },
    });
  },
  passwordPrompt: false,
  setPasswordPrompt: prompt => set({passwordPrompt: prompt}),
  password: null,
  setPassword: password => set({password}),
  shareMapMessage: null,
  setShareMapMessage: message => set({shareMapMessage: message}),
}));
