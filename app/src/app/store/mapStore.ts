'use client';
import type {MapGeoJSONFeature, MapOptions} from 'maplibre-gl';
import type {MapRef} from 'react-map-gl/maplibre';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import type {ActiveTool, MapFeatureInfo, NullableZone, SpatialUnit} from '@constants/types';
import {Zone, GDBPath} from '@constants/types';
import {
  DistrictrMap,
  DocumentObject,
  RemoteAssignmentsResponse,
  ShatterResult,
  DocumentMetadata,
  StatusObject,
} from '@utils/api/apiHandlers/types';
import {lastSentAssignments} from '@utils/api/apiHandlers/formatAssignments';
import maplibregl from 'maplibre-gl';
import type {MutableRefObject} from 'react';
import {QueryObserverResult} from '@tanstack/react-query';
import {
  ContextMenuState,
  PaintEventHandler,
  checkIfSameZone,
  getFeaturesInBbox,
  resetZoneColors,
  setZones,
} from '../utils/helpers';
import {checkoutDocument, patchReset, patchShatter, patchUnShatter} from '../utils/api/mutations';
import bbox from '@turf/bbox';
import {BLOCK_SOURCE_ID, FALLBACK_NUM_DISTRICTS, OVERLAY_OPACITY} from '../constants/layers';
import {DistrictrMapOptions} from './types';
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
  // EDITING MODE
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
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
  /**
   * Selects map features and updates the zone assignments accordingly.
   * Debounced zone updates will be sent to backend after a delay.
   * @param {Array<MapGeoJSONFeature>} features - The features to select on the map.
   */
  selectMapFeatures: (features: Array<MapGeoJSONFeature>) => void;
  // MAP DOCUMENT
  /**
   * Available districtr views
   */
  mapViews: Partial<QueryObserverResult<DistrictrMap[], Error>>;
  setMapViews: (maps: MapStore['mapViews']) => void;
  /**
   * Current map that the user is working on
   */
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  mapStatus: StatusObject | null;
  setMapStatus: (status: Partial<StatusObject>) => void;
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
   * All broken parent and child IDs. Used to filter data source level
   * map tiles.
   */
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  /**
   * An object with parents and their child geometries.
   * When a broken parent is painted over, this mapping is used to check if all children are in the same zone.
   * Additionally, it is used when re-entering captive break blocks mode on an already-broken parent.
   */
  shatterMappings: Record<string, Set<string>>;
  /**
   * Leave the captive blocks view and return to the default painting mode.
   * @param {boolean} lock - On exit, optionally lock the features
   */
  exitBlockView: (lock?: boolean) => void;
  setShatterIds: (
    existingParents: Set<string>,
    existingChildren: Set<string>,
    newParent: string[],
    newChildren: Set<string>[],
    multipleShattered: boolean
  ) => void;
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
  /**
   * A set of feature IDs that are currently locked, preventing any modifications to them.
   * Map render effects in `mapRenderSubs` -> `lockFeaturesSub`
   * Lock feature logic in `helpers` -> `getFeaturesInBbox`
   */
  lockedFeatures: Set<string>;
  /**
   * Locks or unlocks a specific feature by its ID.
   * @param {string} id - The ID of the feature to lock or unlock.
   * @param {boolean} lock - If true, the feature will be locked; if false, it will be unlocked.
   */
  lockFeature: (id: string, lock: boolean) => void;
  /**
   * Locks or unlocks multiple features at once based on their IDs.
   * @param {Set<string>} ids - A set of feature IDs to lock or unlock.
   * @param {boolean} lock - If true, the features will be locked; if false, they will be unlocked.
   */
  lockFeatures: (ids: Set<string>, lock: boolean) => void;
  /**
   * Sets the locked features to a new set of locked features.
   * @param {Set<string>} lockedFeatures - The new set of locked features.
   */
  setLockedFeatures: (lockedFeatures: MapStore['lockedFeatures']) => void;
  setLockedZones: (areas: MapStore['mapOptions']['lockPaintedAreas']) => void;
  toggleLockAllAreas: () => void;
  // FOCUS
  /**
   * Parent IDs that a user is working on in break mode.
   * Map render effects in `mapRenderSubs` -> `_applyFocusFeatureState`
   */
  focusFeatures: Array<MapFeatureInfo>;
  mapOptions: MapOptions & DistrictrMapOptions;
  setMapOptions: (options: Partial<MapStore['mapOptions']>) => void;
  sidebarPanels: Array<'layers' | 'population' | 'demography' | 'election' | 'mapValidation'>;
  setSidebarPanels: (panels: MapStore['sidebarPanels']) => void;
  // HIGHLIGHT
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  zoneAssignments: Map<string, NullableZone>; // geoid -> zone
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  /**
   * Map of ISO timestamps.
   * Keeps track of when a zone was last to keep track of when to refetch data
   */
  zonesLastUpdated: Map<Zone, string>;
  assignmentsHash: string;
  setAssignmentsHash: (hash: string) => void;
  lastUpdatedHash: string;
  workerUpdateHash: string;
  setWorkerUpdateHash: (hash: string) => void;
  loadZoneAssignments: (assignmentsData: RemoteAssignmentsResponse) => void;
  resetZoneAssignments: () => void;
  zonePopulations: Map<Zone, number>;
  setZonePopulations: (zone: Zone, population: number) => void;
  handleReset: () => void;
  accumulatedGeoids: Set<string>;
  allPainted: Set<string>;
  setAccumulatedGeoids: (geoids: MapStore['accumulatedGeoids']) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  isPainting: boolean;
  setIsPainting: (isPainting: boolean) => void;
  paintFunction: PaintEventHandler;
  setPaintFunction: (paintFunction: PaintEventHandler) => void;
  clearMapEdits: () => void;
  freshMap: boolean;
  setFreshMap: (resetMap: boolean) => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // user id
  userID: string | null;
  setUserID: () => void;

  // USER MAPS / RECENT MAPS
  userMaps: Array<DocumentObject & {name?: string; map_module?: string}>;
  setUserMaps: (userMaps: MapStore['userMaps']) => void;
  upsertUserMap: (props: {
    documentId?: string;
    mapDocument?: MapStore['mapDocument'];
    userMapDocumentId?: string;
    userMapData?: MapStore['userMaps'][number];
  }) => void;
  deleteUserMap: (documentId: string) => void;
  mapName: () => string | undefined;
  mapMetadata: DocumentObject['map_metadata'];
  updateMetadata: (
    documentId: string,
    name?: any,
    tags?: any,
    description?: any,
    group?: any,
    eventId?: any,
    draft_status?: any
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
  isEditing: false,
  setIsEditing: (isEditing: boolean) => set({isEditing}),
  captiveIds: new Set<string>(),
  exitBlockView: (lock: boolean = false) => {
    const {focusFeatures, mapOptions, zoneAssignments, shatterMappings, lockFeatures} = get();

    set({
      captiveIds: new Set<string>(),
      focusFeatures: [],
      mapOptions: {
        ...mapOptions,
        mode: 'default',
      },
      activeTool: 'shatter',
    });

    const parentId = focusFeatures?.[0].id?.toString();
    if (!parentId) return;
    const willHeal = checkIfSameZone(shatterMappings[parentId], zoneAssignments).shouldHeal;
    const children = shatterMappings[parentId];
    if (lock && !willHeal && children?.size) lockFeatures(children, true);
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
  selectMapFeatures: features => {
    let {
      accumulatedGeoids,
      activeTool,
      mapDocument,
      mapStatus,
      getMapRef,
      selectedZone: _selectedZone,
      allPainted,
      zonesLastUpdated,
    } = get();

    const updateHash = new Date().toISOString();
    const map = getMapRef();
    const selectedZone = activeTool === 'eraser' ? null : _selectedZone;
    if (!map || !mapDocument?.document_id || mapStatus?.access === 'read') {
      return;
    }
    // We can access the inner state of the map in a more ergonomic way than the convenience method `getFeatureState`
    // the inner state here gives us access to { [sourceLayer]: { [id]: { ...stateProperties }}}
    // So, we get things like `zone` and `locked` and `broken` etc without needing to check a bunch of different places
    // Additionally, since `setFeatureState` happens synchronously, there is no guessing game of when the state updates
    const featureStateCache = map.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    const featureStateChangesCache =
      map.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.stateChanges;

    if (!featureStateCache) return;
    // PAINT
    const popChanges: Record<number, number> = {};
    selectedZone !== null && (popChanges[selectedZone] = 0);
    if (features?.length && selectedZone) {
      zonesLastUpdated.set(selectedZone, updateHash);
    }
    features?.forEach(feature => {
      const id = feature?.id?.toString() ?? undefined;
      const sourceLayer = feature.properties.__sourceLayer || feature.sourceLayer;
      if (!id || !sourceLayer) return;
      const state = featureStateCache[sourceLayer]?.[id];
      const stateChanges = featureStateChangesCache?.[sourceLayer]?.[id];

      const prevAssignment = stateChanges?.zone || state?.zone || false;

      const shouldSkip =
        accumulatedGeoids.has(id) || state?.['locked'] || prevAssignment === selectedZone || false;
      if (shouldSkip) return;
      zonesLastUpdated.set(prevAssignment, updateHash);
      accumulatedGeoids.add(feature.properties?.path);
      // TODO: Tiles should have population values as numbers, not strings
      const popValue = parseInt(feature.properties?.total_pop_20);
      if (!isNaN(popValue)) {
        if (prevAssignment) {
          popChanges[prevAssignment] = (popChanges[prevAssignment] || 0) - popValue;
        }
        if (selectedZone) {
          popChanges[selectedZone] = (popChanges[selectedZone] || 0) + popValue;
        }
      }
      allPainted.add(id);
      map.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer,
        },
        {selected: true, zone: selectedZone}
      );
    });

    useChartStore.getState().setPaintedChanges(popChanges);
    set({
      isTemporalAction: false,
      assignmentsHash: updateHash,
      zonesLastUpdated: new Map(zonesLastUpdated),
    });
  },
  mapViews: {isPending: true},
  setMapViews: mapViews => set({mapViews}),
  mapDocument: null,
  setMapDocument: mapDocument => {
    demographyCache.clear();
    const {
      mapDocument: currentMapDocument,
      activeTool: currentActiveTool,
      setFreshMap,
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
    lastSentAssignments.clear();
    demographyCache.clear();
    setFreshMap(true);
    resetZoneAssignments();
    useDemographyStore.getState().clear();
    useUnassignFeaturesStore.getState().reset();

    const upsertMapOnDrawSub = useMapStore.subscribe(
      state => state.zoneAssignments,
      za => {
        if (useMapStore.getState().mapDocument !== mapDocument || za.size) {
          upsertMapOnDrawSub();
        }
        if (useMapStore.getState().mapDocument === mapDocument && za.size) {
          upsertUserMap({mapDocument});
        }
      }
    );

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
  mapStatus: null,
  setMapStatus: mapStatus => {
    const prev = get().mapStatus || {};
    set({mapStatus: {...prev, ...mapStatus} as StatusObject});
  },
  colorScheme: DefaultColorScheme,
  setColorScheme: colorScheme => set({colorScheme}),
  lockedFeatures: new Set(),
  lockFeature: (id, lock) => {
    const lockedFeatures = new Set(get().lockedFeatures);
    lock ? lockedFeatures.add(id) : lockedFeatures.delete(id);
    set({lockedFeatures});
  },
  lockFeatures: (featuresToLock, lock) => {
    const lockedFeatures = new Set(get().lockedFeatures);
    featuresToLock.forEach(id => (lock ? lockedFeatures.add(id) : lockedFeatures.delete(id)));
    set({lockedFeatures});
  },
  setLockedFeatures: lockedFeatures => set({lockedFeatures}),
  silentlyShatter: async (document_id, geoids) => {
    const {getMapRef, mapDocument} = get();
    const mapRef = getMapRef();
    if (!mapRef) return;
    set({mapLock: true});
    const updateHash = new Date().toISOString();
    const r = await patchShatter.mutate({
      document_id,
      geoids,
      updateHash,
    });
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
    const {getMapRef, zoneAssignments, mapDocument, shatterMappings, allPainted} = get();
    const mapRef = getMapRef();
    if (!mapRef) return;
    set({mapLock: true});
    const updateHash = new Date().toISOString();
    const zone = zoneAssignments.get(parentsToHeal[0])!;
    const sourceLayer = mapDocument?.parent_layer;
    const r = await patchUnShatter.mutate({
      geoids: parentsToHeal,
      zone: zoneAssignments.get(parentsToHeal[0])!,
      document_id,
      updateHash,
    });
    const children = shatterMappings[parentsToHeal[0]];
    children?.forEach(child => {
      // remove from allPainted
      allPainted.delete(child);
    });

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
    const {shatterIds, shatterMappings, lockedFeatures} = get();
    const isAlreadyShattered = geoids.some(id => shatterMappings.hasOwnProperty(id));
    const shatterResult: ShatterResult = isAlreadyShattered
      ? ({
          parents: {geoids},
          children: Array.from(combineSetValues(shatterMappings, geoids)).map(id => ({
            geo_id: id,
            document_id,
            parent_path: '',
          })),
        } as ShatterResult)
      : await patchShatter.mutate({
          document_id,
          geoids,
          updateHash,
        });

    if (!shatterResult.children.length) {
      const mapDocument = get().mapDocument;
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
    const newLockedFeatures = new Set(lockedFeatures);
    let existingParents = new Set(shatterIds.parents);
    let existingChildren = new Set(shatterIds.children);
    const newParent = shatterResult.parents.geoids;
    const newChildren = new Set(shatterResult.children.map(child => child.geo_id));
    newChildren.forEach(child => newLockedFeatures.delete(child));
    const zoneAssignments = new Map(get().zoneAssignments);
    const multipleShattered = shatterResult.parents.geoids.length > 1;
    const featureBbox = features[0].geometry && bbox(features[0].geometry);
    const mapBbox =
      featureBbox?.length && featureBbox?.length >= 4
        ? (featureBbox.slice(0, 4) as MapStore['mapOptions']['bounds'])
        : undefined;

    if (!isAlreadyShattered && !multipleShattered) {
      newParent.forEach(parent => existingParents.add(parent));
      existingChildren = new Set([...existingChildren, ...newChildren]);

      setZones(zoneAssignments, newParent[0], newChildren);
      shatterMappings[newParent[0]] = newChildren;
    } else if (multipleShattered) {
      // todo handle multiple shattered case
    } else if (isAlreadyShattered) {
    }

    set({
      shatterIds: {
        parents: existingParents,
        children: existingChildren,
      },
      assignmentsHash: updateHash,
      lastUpdatedHash: updateHash,
      // TODO: Should this be true instead?
      // Is there a way to clean up the state history during
      // break / shatter?
      isTemporalAction: false,
      mapLock: false,
      captiveIds: newChildren,
      lockedFeatures: newLockedFeatures,
      focusFeatures: [
        {
          id: features[0].id,
          source: BLOCK_SOURCE_ID,
          sourceLayer: get().mapDocument?.parent_layer,
        },
      ],
      activeTool: 'brush',
      zoneAssignments,
      parentsToHeal: [...get().parentsToHeal, features?.[0]?.id?.toString() || '']
        .filter(onlyUnique)
        .filter(f => f.length),
      mapOptions: {
        ...get().mapOptions,
        mode: 'break',
        bounds: mapBbox,
      },
    });
  },
  parentsToHeal: [],
  processHealParentsQueue: async (additionalIds = []) => {
    const updateHash = new Date().toISOString();
    const {
      isPainting,
      parentsToHeal: _parentsToHeal,
      mapDocument,
      shatterMappings,
      zoneAssignments,
      shatterIds,
      mapLock,
      lockedFeatures,
      getMapRef,
      allPainted,
    } = get();
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

      const r = await patchUnShatter.mutate({
        geoids: parentsToHeal.map(f => f.parentId),
        zone: parentsToHeal[0].zone as any,
        document_id: mapDocument?.document_id,
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
          children.forEach(child => {
            // remove from allPainted
            allPainted.delete(child);
          });
        });
      const newZoneAssignments = new Map(zoneAssignments);
      const newShatterIds = {
        parents: new Set(shatterIds.parents),
        children: new Set(shatterIds.children),
      };
      const newLockedFeatures = new Set(lockedFeatures);
      const childrenToRemove = parentsToHeal.map(f => shatterMappings[f.parentId]).filter(Boolean);

      childrenToRemove.forEach(childSet => {
        childSet.forEach(childId => {
          newZoneAssignments.delete(childId);
          newShatterIds.children.delete(childId);
          newLockedFeatures.delete(childId);
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
        delete shatterMappings[parent.parentId];
        newShatterIds.parents.delete(parent.parentId);
        newZoneAssignments.set(parent.parentId, parent.zone!);
      });
      set({
        shatterIds: newShatterIds,
        mapLock: false,
        isTemporalAction: false,
        shatterMappings: {...shatterMappings},
        zoneAssignments: newZoneAssignments,
        lockedFeatures: newLockedFeatures,
        lastUpdatedHash: updateHash,
        assignmentsHash: updateHash,
        // parents may have been added while this is firing off
        // get curernt, and filter for any that were removed by this event
        parentsToHeal: get().parentsToHeal.filter(f => !r.geoids.includes(f)),
      });
    }
  },
  checkParentsToHeal: parentsToHeal => {
    set({
      parentsToHeal: [...get().parentsToHeal, ...parentsToHeal].filter(onlyUnique),
    });
  },
  shatterMappings: {},
  upsertUserMap: ({mapDocument, userMapData, userMapDocumentId}) => {
    if (!mapDocument?.document_id || mapDocument.access === 'read') return;
    const {userMaps: _userMaps, mapViews: _mapViews, mapDocument: _mapDocument} = get();
    let userMaps = [..._userMaps];
    const mapViewsData = _mapViews.data;
    if (mapDocument?.document_id && mapViewsData) {
      const documentIndex = userMaps.findIndex(f => f.document_id === mapDocument?.document_id);
      const documentInfo = mapViewsData.find(
        view => view.districtr_map_slug === mapDocument.districtr_map_slug
      );
      if (documentIndex !== -1) {
        userMaps[documentIndex] = {
          ...documentInfo,
          ...userMaps[documentIndex],
          ...mapDocument,
          map_metadata: mapDocument.map_metadata ?? userMaps[documentIndex].map_metadata,
        };
      } else {
        userMaps = [{...mapDocument, ...documentInfo}, ...userMaps];
      }
    } else if (userMapDocumentId) {
      const i = userMaps.findIndex(map => map.document_id === userMapDocumentId);
      if (userMapData) {
        userMaps.splice(i, 1, userMapData); // Replace the map at index i with the new data
      } else {
        // Navigate to home page when deleting current map
        window.location.href = '/';
        userMaps.splice(i, 1);
      }
    }
    if (_mapDocument?.document_id === mapDocument?.document_id) {
      set({
        mapDocument: {
          ...mapDocument,
          map_metadata: {
            ..._mapDocument.map_metadata,
            ...mapDocument.map_metadata,
          },
        },
      });
    }
    set({
      userMaps,
    });
  },
  deleteUserMap: documentId => {
    set(state => ({
      userMaps: state.userMaps.filter(map => map.document_id !== documentId),
    }));
  },
  shatterIds: {
    parents: new Set(),
    children: new Set(),
  },

  handleReset: async () => {
    const {mapDocument, getMapRef, zoneAssignments, shatterIds} = get();
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
      lastSentAssignments.clear();
      resetZoneColors({
        zoneAssignments,
        mapRef: getMapRef(),
        mapDocument,
        shatterIds,
      });

      set({
        zonePopulations: new Map(),
        zoneAssignments: new Map(),
        shatterIds: {
          parents: new Set(),
          children: new Set(),
        },
        appLoadingState: 'loaded',
        mapLock: false,
        activeTool: 'pan',
        colorScheme: DefaultColorScheme,
        assignmentsHash: updateHash,
        lastUpdatedHash: updateHash,
      });
    }
  },
  setShatterIds: (existingParents, existingChildren, newParent, newChildren, multipleShattered) => {
    const zoneAssignments = new Map(get().zoneAssignments);

    if (!multipleShattered) {
      setZones(zoneAssignments, newParent[0], newChildren[0]);
    } else {
      // todo handle multiple shattered case
    }
    newParent.forEach(parent => existingParents.add(parent));
    // there may be a faster way to do this
    newChildren.forEach(
      children => (existingChildren = new Set([...existingChildren, ...children]))
    );

    set({
      shatterIds: {
        parents: existingParents,
        children: existingChildren,
      },
      zoneAssignments,
    });
  },
  focusFeatures: [],
  mapOptions: {
    center: [-98.5795, 39.8283],
    zoom: 3,
    pitch: 0,
    bearing: 0,
    container: '',
    highlightBrokenDistricts: false,
    mode: 'default',
    lockPaintedAreas: [],
    prominentCountyNames: true,
    showCountyBoundaries: true,
    showPaintedDistricts: true,
    showZoneNumbers: true,
    overlayOpacity: OVERLAY_OPACITY,
  },
  setMapOptions: options => set({mapOptions: {...get().mapOptions, ...options}}),
  sidebarPanels: ['population'],
  setSidebarPanels: sidebarPanels => set({sidebarPanels}),
  toggleLockAllAreas: () => {
    const {mapOptions, mapDocument} = get();
    const num_districts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
    set({
      mapOptions: {
        ...mapOptions,
        lockPaintedAreas: mapOptions.lockPaintedAreas.length
          ? []
          : new Array(num_districts).fill(0).map((_, i) => i + 1),
      },
    });
  },
  setLockedZones: areas => {
    const {mapOptions} = get();
    set({
      mapOptions: {
        ...mapOptions,
        lockPaintedAreas: areas,
      },
    });
  },
  activeTool: 'pan',
  setActiveTool: tool => {
    const canEdit = get().mapDocument?.access === 'edit';
    if (canEdit) {
      set({activeTool: tool});
    }
  },
  spatialUnit: 'tract',
  setSpatialUnit: unit => set({spatialUnit: unit}),
  selectedZone: 1,
  setSelectedZone: zone => {
    const numDistricts = get().mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
    const isPainting = get().isPainting;
    if (zone <= numDistricts && !isPainting) {
      set({
        selectedZone: zone,
      });
    }
  },
  zoneAssignments: new Map(),
  zonesLastUpdated: new Map(),
  assignmentsHash: '',
  setAssignmentsHash: hash => set({assignmentsHash: hash}),
  lastUpdatedHash: new Date().toISOString(),
  workerUpdateHash: new Date().toISOString(),
  setWorkerUpdateHash: hash => set({workerUpdateHash: hash}),
  accumulatedGeoids: new Set<string>(),
  setAccumulatedGeoids: accumulatedGeoids => set({accumulatedGeoids}),
  allPainted: new Set<string>(),
  setZoneAssignments: (zone, geoids) => {
    const zoneAssignments = get().zoneAssignments;
    const newZoneAssignments = new Map(zoneAssignments);
    geoids.forEach(geoid => {
      newZoneAssignments.set(geoid, zone);
    });
    set({
      zoneAssignments: newZoneAssignments,
      accumulatedGeoids: new Set<string>(),
      lastUpdatedHash: new Date().toISOString(),
    });
  },
  loadZoneAssignments: assignmentsData => {
    lastSentAssignments.clear();
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
      lastSentAssignments.set(assignment.geo_id, assignment.zone);
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
  zonePopulations: new Map(),
  setZonePopulations: (zone, population) =>
    set(state => {
      const newZonePopulations = new Map(state.zonePopulations);
      newZonePopulations.set(zone, population);
      return {
        zonePopulations: newZonePopulations,
      };
    }),
  resetZoneAssignments: () => set({zoneAssignments: new Map()}),
  brushSize: 1,
  setBrushSize: size => set({brushSize: size}),
  isPainting: false,
  setIsPainting: isPainting => {
    if (!isPainting) {
      const {
        setZoneAssignments,
        accumulatedGeoids,
        selectedZone,
        activeTool,
        assignmentsHash,
        lastUpdatedHash,
      } = get();
      if (assignmentsHash !== lastUpdatedHash && accumulatedGeoids.size > 0) {
        const zone = activeTool === 'eraser' ? null : selectedZone;
        setZoneAssignments(zone, accumulatedGeoids);
      }
    }
    set({isPainting});
  },
  paintFunction: getFeaturesInBbox,
  setPaintFunction: paintFunction => set({paintFunction}),
  clearMapEdits: () =>
    set({
      zoneAssignments: new Map(),
      accumulatedGeoids: new Set<string>(),
      selectedZone: 1,
    }),
  freshMap: false,
  setFreshMap: resetMap => set({freshMap: resetMap}),
  contextMenu: null,
  setContextMenu: contextMenu => set({contextMenu}),
  userMaps: [],
  setUserMaps: userMaps => set({userMaps}),
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
  updateMetadata: (documentId: string, key: keyof DocumentMetadata, value: any) =>
    set(state => {
      const userMaps = get().userMaps;
      const updatedMaps = userMaps.map(map => {
        if (map.document_id === documentId) {
          const updatedMetadata = {
            ...map.map_metadata,
            [key]: value,
          };
          return {
            ...map,
            map_metadata: updatedMetadata,
          };
        }
        return map;
      }) as DocumentObject[];
      return {userMaps: updatedMaps};
    }),
  passwordPrompt: false,
  setPasswordPrompt: prompt => set({passwordPrompt: prompt}),
  password: null,
  setPassword: password => set({password}),
  shareMapMessage: null,
  setShareMapMessage: message => set({shareMapMessage: message}),
}));
