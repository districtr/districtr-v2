'use client';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import type {MapRef} from 'react-map-gl/maplibre';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import type {MapFeatureInfo} from '@constants/types';
import {
  Community,
  DistrictrMap,
  DocumentObject,
  DocumentMetadata,
  StatusObject,
  DocumentComment,
} from '@utils/api/apiHandlers/types';
import maplibregl from 'maplibre-gl';
import type {MutableRefObject} from 'react';
import {QueryObserverResult} from '@tanstack/react-query';
import {ContextMenuState} from '@utils/map/types';
import {resetZoneColors} from '@utils/map/resetZoneColors';
import {setZones} from '@utils/map/setZones';
import bbox from '@turf/bbox';
import {FALLBACK_NUM_COMMUNITIES} from '../constants/map/mapDefaults';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {createWithDevWrapperAndSubscribe} from './middlewares';
import GeometryWorker from '../utils/GeometryWorker';
import {nanoid} from 'nanoid';
import {useUnassignFeaturesStore} from './unassignedFeatures';
import {demographyCache} from '../utils/demography/demographyCache';
import {useDemographyStore} from './demography/demographyStore';
import {extendColorArray} from '../utils/colors';
import {getChildEdges} from '../utils/api/apiHandlers/getChildEdges';
import {DEFAULT_MAP_OPTIONS, useMapControlsStore} from './mapControlsStore';
import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';
import {patchUpdateReset} from '../utils/api/apiHandlers/patchUpdateReset';
import {idb} from '../utils/idb/idb';
import {MAP_MODE_DEFAULT_OPTIONS} from '@/app/constants/map/mapModeDefaults';
import {
  DEFAULT_COMMUNITY_DESCRIPTION,
  getNextCommunityName,
  getHighestCommunityId,
  getNextCommunityId,
  getNextUnusedCommunityColor,
  normalizeCommunities,
  removeCommunityAndShiftRenderOrder,
  sortCommunitiesByRenderOrder,
  syncCoiColorsToColorScheme,
} from '../utils/communities';
import {temporalManager} from '../utils/temporal';

const resolveNumCommunities = (
  mapDocument: DocumentObject | null | undefined,
  fallbackDocument?: DocumentObject | null
) => {
  return Math.max(
    0,
    mapDocument?.community_metadata_list?.length ??
      fallbackDocument?.community_metadata_list?.length ??
      mapDocument?.num_communities ??
      fallbackDocument?.num_communities ??
      FALLBACK_NUM_COMMUNITIES
  );
};

const sanitizeCommunityDescription = (
  description: string | undefined,
  maxLength: number,
  fallback = DEFAULT_COMMUNITY_DESCRIPTION
) => (description?.trim() || fallback).slice(0, maxLength);

const MISSING_DESCRIPTION_COMMENT_INDEX = -1;
const trimCommentText = (text?: string | null) => (text ?? '').trim();

const syncCommunityDescriptionComment = ({
  comments,
  communityId,
  currentDescription,
  nextDescription,
  descriptionCommentId,
}: {
  comments: DocumentComment[];
  communityId: number;
  currentDescription: string;
  nextDescription: string;
  descriptionCommentId?: string | null;
}) => {
  let nextDescriptionCommentId = descriptionCommentId ?? null;
  const currentDescriptionText = currentDescription.trim();
  const nextDescriptionText = nextDescription.trim();
  let descriptionCommentIndex = MISSING_DESCRIPTION_COMMENT_INDEX;

  if (nextDescriptionCommentId !== null) {
    descriptionCommentIndex = comments.findIndex(
      comment => comment.comment_id === nextDescriptionCommentId
    );
  }

  if (descriptionCommentIndex === MISSING_DESCRIPTION_COMMENT_INDEX) {
    descriptionCommentIndex = comments.findIndex(
      comment =>
        comment.zone === communityId && trimCommentText(comment.text) === currentDescriptionText
    );

    // Failed to find an existing comment for the description, so we need to create one
    if (descriptionCommentIndex === MISSING_DESCRIPTION_COMMENT_INDEX) {
      const newCommentId = crypto.randomUUID();
      return {
        comments: [
          ...comments,
          {comment_id: newCommentId, zone: communityId, text: nextDescription},
        ],
        descriptionCommentId: newCommentId,
        changed: true,
      };
    }

    nextDescriptionCommentId = comments[descriptionCommentIndex].comment_id ?? null;
  }

  const currentComment = comments[descriptionCommentIndex];
  if (
    currentComment.zone === communityId &&
    trimCommentText(currentComment.text) === nextDescriptionText
  ) {
    return {
      comments,
      descriptionCommentId: nextDescriptionCommentId,
      changed: false,
    };
  }

  return {
    comments: comments.map((comment, index) =>
      index === descriptionCommentIndex
        ? {...comment, zone: communityId, text: nextDescription}
        : comment
    ),
    descriptionCommentId: nextDescriptionCommentId,
    changed: true,
  };
};

export interface MapStore {
  // LOAD AND RENDERING STATE TRACKING
  appLoadingState: 'loaded' | 'initializing' | 'loading' | 'blurred';
  setAppLoadingState: (state: MapStore['appLoadingState']) => void;
  mapRenderingState: 'loaded' | 'initializing' | 'loading';
  setMapRenderingState: (state: MapStore['mapRenderingState']) => void;
  // MAP CANVAS REF AND CONTROLS
  getMapRef: () => maplibregl.Map | undefined;
  setMapRef: (map: MutableRefObject<MapRef | null>) => void;
  mapLock: {
    isLocked: boolean;
    reason: string;
  } | null;
  setMapLock: (lock: MapStore['mapLock']) => void;
  errorNotification: {
    message?: string;
    severity?: 1 | 2 | 3; // 1: dialog, 2: toast, 3: silent
    id?: string;
  };
  setErrorNotification: (errorNotification: MapStore['errorNotification']) => void;
  showSaveConflictModal: boolean;
  setShowSaveConflictModal: (show: boolean) => void;
  // MAP DOCUMENT
  /**
   * Available districtr views
   */
  mapViews: Partial<QueryObserverResult<DistrictrMap[], Error>>;
  setMapViews: (maps: MapStore['mapViews']) => void;
  mapDocument: DocumentObject | null;
  updated: {
    metadata: boolean;
    comments: boolean;
  };
  setMapDocument: (mapDocument: DocumentObject) => void;
  flushMapState: boolean;
  initiateFlushMapState: () => Promise<void>;
  mutateMapDocument: (mapDocument: Partial<DocumentObject>) => void;
  clearUpdatedChanges: () => void;
  mapStatus: StatusObject | null;
  setMapStatus: (mapStatus: Partial<StatusObject>) => void;
  setNumDistricts: (numDistricts: number) => void;
  numCommunities: number;
  communities: Community[];
  setNumCommunities: (numCommunities: number) => void;
  setCommunities: (communities: Community[]) => void;
  addCommunity: (options?: {name?: string; description?: string; color?: string}) => void;
  updateCommunity: (
    communityId: number,
    options: {name?: string; description?: string; color?: string}
  ) => void;
  removeCommunity: (communityId: number) => void;

  // ZONE COMMENTS
  pinnedCommentZone: number | null;
  setPinnedCommentZone: (zone: number | null) => void;
  addZoneComment: (zone: number, comment: DocumentComment) => void;
  editZoneComment: (zone: number, index: number, text: string) => void;
  removeZoneComment: (zone: number, index: number) => void;
  getZoneCommentsForZone: (zone: number) => DocumentComment[];
  getZonesWithComments: () => number[];

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
  handleShatter: (features: Array<Partial<MapGeoJSONFeature>>) => void;
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
  handleReset: () => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // user id
  userID: string | null;
  setUserID: () => void;

  mapName: () => string | undefined;
  mapMetadata: DocumentObject['map_metadata'];
  updateMetadata: (metadata: Partial<DocumentMetadata>) => void;
  // SHARE MAP
  passwordPrompt: boolean;
  setPasswordPrompt: (prompt: boolean) => void;
  password: string | null;
  setPassword: (password: string | null | undefined) => void;
}

const initialLoadingState =
  typeof window !== 'undefined' &&
  (window.location.pathname.startsWith('/map/') ||
    window.location.pathname.startsWith('/map/edit/'))
    ? 'loading'
    : 'initializing';

export const useMapStore = createWithDevWrapperAndSubscribe<MapStore>('Districtr Map Store')(
  (set, get) => ({
    appLoadingState: initialLoadingState,
    setAppLoadingState: appLoadingState => set({appLoadingState}),
    mapRenderingState: 'initializing',
    setMapRenderingState: mapRenderingState => set({mapRenderingState}),
    captiveIds: new Set<string>(),

    exitBlockView: (lock: boolean = false) => {
      const {focusFeatures} = get();
      const {healParentsIfAllChildrenInSameZone} = useAssignmentsStore.getState();
      const {healParentsIfAllChildrenInSameCommunities} = useCoiAssignmentsStore.getState();
      const {setMapOptions, mapMode} = useMapControlsStore.getState();
      const focusedParentId = focusFeatures?.[0]?.id?.toString();

      set({
        captiveIds: new Set<string>(),
        focusFeatures: [],
      });
      setMapOptions({mode: 'default'});
      useMapControlsStore.setState({activeTool: 'shatter'});

      if (mapMode === 'coi') {
        healParentsIfAllChildrenInSameCommunities(
          focusedParentId ? new Set<string>([focusedParentId]) : undefined
        );
      } else {
        healParentsIfAllChildrenInSameZone(
          focusedParentId ? {_parentIds: new Set<string>([focusedParentId])} : {},
          'state'
        );
        temporalManager.resume(mapMode);
      }
    },

    getMapRef: () => undefined,

    setMapRef: mapRef => {
      set({
        getMapRef: () => mapRef.current?.getMap(),
        appLoadingState: initialLoadingState === 'initializing' ? 'loaded' : get().appLoadingState,
      });
    },

    mapLock: null,

    setMapLock: mapLock => set({mapLock}),

    errorNotification: {},

    setErrorNotification: errorNotification => set({errorNotification}),

    showSaveConflictModal: false,

    setShowSaveConflictModal: show => set({showSaveConflictModal: show}),

    mapViews: {isPending: true},

    setMapViews: mapViews => set({mapViews}),

    mapDocument: null,

    numCommunities: FALLBACK_NUM_COMMUNITIES,

    communities: normalizeCommunities({
      count: FALLBACK_NUM_COMMUNITIES,
      colorScheme: DefaultColorScheme,
    }),

    updated: {
      metadata: false,
      comments: false,
    },

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
      const remoteIsNewer =
        bothHaveData && currentMapDocument.updated_at! < mapDocument.updated_at!;
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

      let newStateFipsSet: Set<string> = new Set();
      if (mapDocument.statefps) {
        newStateFipsSet = new Set(mapDocument.statefps);
      } else if (
        currentMapDocument?.parent_layer &&
        mapDocument?.parent_layer &&
        currentMapDocument.parent_layer === mapDocument.parent_layer
      ) {
        newStateFipsSet = new Set(mapControlsState.mapOptions.stateFipsSet);
      }

      const numCommunities = resolveNumCommunities(
        mapDocument,
        idIsSame ? currentMapDocument : undefined
      );
      const existingCommunities = normalizeCommunities({
        communities:
          mapDocument.community_metadata_list ??
          (idIsSame ? currentMapDocument?.community_metadata_list : null),
        count: numCommunities,
        colorScheme: mapDocument.color_scheme ?? DefaultColorScheme,
      });

      // If the color scheme does not cover all zones, extend it
      let colorScheme = mapDocument.color_scheme ?? DefaultColorScheme;
      const maxZoneCountForColors = Math.max(
        mapDocument.num_districts ?? 0,
        getHighestCommunityId(existingCommunities),
        numCommunities
      );
      if (maxZoneCountForColors > colorScheme.length) {
        colorScheme = extendColorArray(colorScheme, maxZoneCountForColors);
      }
      const communities = normalizeCommunities({
        communities: existingCommunities,
        count: numCommunities,
        colorScheme,
      });
      colorScheme = syncCoiColorsToColorScheme(communities, colorScheme);

      useMapControlsStore.setState({
        mapOptions: {
          ...DEFAULT_MAP_OPTIONS,
          ...MAP_MODE_DEFAULT_OPTIONS[mapControlsState.mapMode],
          bounds: mapDocument.extent,
          stateFipsSet: newStateFipsSet,
        },
        activeTool: mapDocument.access === 'edit' ? mapControlsState.activeTool : 'pan',
        selectedZone: communities[0]?.id ?? mapControlsState.selectedZone,
        sidebarPanels: ['population'],
        isPainting: false,
        isEditing: mapDocument.access === 'edit',
      });

      useAssignmentsStore.getState().resetShatterState();

      set({
        mapDocument: {
          ...mapDocument,
          num_communities: numCommunities,
          community_metadata_list: communities,
          color_scheme: colorScheme,
        },
        numCommunities,
        communities,
        mapStatus: {
          access: mapDocument.access,
          genesis: mapDocument.genesis,
          token: mapDocument.token,
          password: mapDocument.password,
        },
        captiveIds: new Set(),
        focusFeatures: [],
        mapLock: null,
        appLoadingState: mapDocument?.genesis === 'copied' ? 'loaded' : 'initializing',
        mapRenderingState:
          mapDocument.tiles_s3_path === currentMapDocument?.tiles_s3_path ? 'loaded' : 'loading',
      });
    },

    flushMapState: false,

    initiateFlushMapState: async () => {
      set({flushMapState: true});
      // wait for 50ms
      // This is enough time to trigger a state update on esesntially all machines
      // This forces an unmount and remount of the map sources, flushing the rendering state
      await new Promise(resolve => setTimeout(resolve, 50));
      set({flushMapState: false});
    },

    mutateMapDocument: mapDocument =>
      set(state => {
        if (!state.mapDocument) return {};
        const nextMapDocument = {...state.mapDocument, ...mapDocument};
        const nextNumCommunities = resolveNumCommunities(nextMapDocument, state.mapDocument);
        const existingCommunities = normalizeCommunities({
          communities: nextMapDocument.community_metadata_list,
          count: nextNumCommunities,
          colorScheme: nextMapDocument.color_scheme ?? DefaultColorScheme,
        });
        const nextColorScheme = extendColorArray(
          nextMapDocument.color_scheme ?? DefaultColorScheme,
          Math.max(
            nextNumCommunities,
            nextMapDocument.num_districts ?? 0,
            getHighestCommunityId(existingCommunities)
          )
        );
        const nextCommunities = normalizeCommunities({
          communities: existingCommunities,
          count: nextNumCommunities,
          colorScheme: nextColorScheme,
        });
        const syncedColorScheme = syncCoiColorsToColorScheme(nextCommunities, nextColorScheme);
        return {
          mapDocument: {
            ...nextMapDocument,
            color_scheme: syncedColorScheme,
            num_communities: nextNumCommunities,
            community_metadata_list: nextCommunities,
          },
          numCommunities: nextNumCommunities,
          communities: nextCommunities,
        };
      }),
    clearUpdatedChanges: () => set({updated: {metadata: false, comments: false}}),

    // ZONE COMMENTS
    pinnedCommentZone: null,
    setPinnedCommentZone: zone => set({pinnedCommentZone: zone}),

    addZoneComment: (zone, comment) => {
      const {mapDocument, updated} = get();
      if (!mapDocument) return;

      const currentComments = mapDocument.document_comments || [];
      const zoneCommentsCount = currentComments.filter(c => c.zone === zone).length;
      if (zoneCommentsCount >= 10) return; // Max 10 comments per district

      const text = (comment.text ?? '').trim().slice(0, 240); // Max 240 chars
      const newMapDocument = {
        ...mapDocument,
        document_comments: [...currentComments, {...comment, zone, text}],
      };
      set({
        mapDocument: newMapDocument,
        updated: {
          ...updated,
          metadata: true,
        },
      });
      // Persist to IDB so comments survive refresh; update timestamp for pending-changes indicator
      if (mapDocument.document_id) {
        const newClientLastUpdated = new Date().toISOString();
        idb.updateIdbDocumentMetadata(newMapDocument, newClientLastUpdated);
        useAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);
      }
    },

    editZoneComment: (zone, index, text) => {
      const {mapDocument, updated} = get();
      if (!mapDocument) return;

      const trimmedText = (text ?? '').trim().slice(0, 240); // Max 240 chars
      const currentComments = mapDocument.document_comments || [];
      let zoneIndex = 0;
      const updatedComments = currentComments.map(c => {
        if (c.zone === zone) {
          if (zoneIndex === index) {
            zoneIndex++;
            return {...c, text: trimmedText};
          }
          zoneIndex++;
        }
        return c;
      });

      const newMapDocument = {
        ...mapDocument,
        document_comments: updatedComments,
      };
      set({
        mapDocument: newMapDocument,
        updated: {
          ...updated,
          comments: true,
        },
      });
      if (mapDocument.document_id) {
        const newClientLastUpdated = new Date().toISOString();
        idb.updateIdbDocumentMetadata(newMapDocument, newClientLastUpdated);
        useAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);
      }
    },

    removeZoneComment: (zone, index) => {
      const {mapDocument, updated} = get();
      if (!mapDocument) return;

      const currentComments = mapDocument.document_comments || [];
      let zoneIndex = 0;
      const updatedComments = currentComments.filter(c => {
        if (c.zone === zone) {
          if (zoneIndex === index) {
            zoneIndex++;
            return false;
          }
          zoneIndex++;
        }
        return true;
      });

      const newMapDocument = {
        ...mapDocument,
        document_comments: updatedComments,
      };
      set({
        mapDocument: newMapDocument,
        updated: {
          ...updated,
          comments: true,
        },
      });
      if (mapDocument.document_id) {
        const newClientLastUpdated = new Date().toISOString();
        idb.updateIdbDocumentMetadata(newMapDocument, newClientLastUpdated);
        useAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);
      }
    },

    getZoneCommentsForZone: (zone: number) => {
      const {mapDocument} = get();
      return (mapDocument?.document_comments || []).filter(c => c.zone === zone);
    },

    getZonesWithComments: () => {
      const {mapDocument} = get();
      const zones = new Set<number>();
      (mapDocument?.document_comments || []).forEach(c => {
        if (c.zone != null) zones.add(c.zone);
      });
      return Array.from(zones).sort((a, b) => a - b);
    },

    mapStatus: null,
    setMapStatus: mapStatus => {
      const prev = get().mapStatus || {};
      set({mapStatus: {...prev, ...mapStatus} as StatusObject});
    },
    setNumDistricts: numDistricts => {
      const {mapDocument, updated, numCommunities} = get();
      if (!mapDocument) return;
      const newColorScheme = extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        Math.max(numDistricts, numCommunities)
      );
      const updatedDocument = {
        ...mapDocument,
        num_districts: numDistricts,
        color_scheme: newColorScheme,
      };
      set({
        mapDocument: updatedDocument,
        updated: {
          ...updated,
          metadata: true,
        },
      });
      // Update IDB to persist the change locally
      if (mapDocument.document_id) {
        const newClientLastUpdated = new Date().toISOString();
        // Update assignments store's clientLastUpdated so SavePopover detects the change
        useAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);

        idb
          .getDocument(mapDocument.document_id)
          .then(idbDoc => {
            if (idbDoc) {
              idb
                .updateDocument({
                  id: mapDocument.document_id,
                  document_metadata: updatedDocument,
                  assignments: idbDoc.assignments,
                  clientLastUpdated: newClientLastUpdated,
                })
                .catch(err => {
                  console.error('Failed to update IDB with num_districts:', err);
                });
            }
          })
          .catch(err => {
            console.error('Failed to get IDB document:', err);
          });
      }
    },
    setNumCommunities: numCommunities => {
      const {mapDocument, updated} = get();
      if (!mapDocument) return;
      const normalizedNumCommunities = Math.max(0, numCommunities);
      const existingCommunities = get().communities;
      const newColorScheme = extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        Math.max(
          normalizedNumCommunities,
          mapDocument.num_districts ?? 0,
          getHighestCommunityId(existingCommunities)
        )
      );
      const nextCommunities = normalizeCommunities({
        communities: existingCommunities,
        count: normalizedNumCommunities,
        colorScheme: newColorScheme,
      });
      const syncedColorScheme = syncCoiColorsToColorScheme(nextCommunities, newColorScheme);
      const updatedDocument = {
        ...mapDocument,
        num_communities: normalizedNumCommunities,
        community_metadata_list: nextCommunities,
        color_scheme: syncedColorScheme,
      };
      set({
        mapDocument: updatedDocument,
        numCommunities: normalizedNumCommunities,
        communities: nextCommunities,
        updated: {
          ...updated,
          metadata: true,
        },
      });

      if (mapDocument.document_id) {
        const newClientLastUpdated = new Date().toISOString();
        if (useMapControlsStore.getState().mapMode === 'coi') {
          useCoiAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);
        } else {
          useAssignmentsStore.getState().setClientLastUpdated(newClientLastUpdated);
        }

        idb
          .getDocument(mapDocument.document_id)
          .then(idbDoc => {
            if (idbDoc) {
              idb
                .updateDocument({
                  id: mapDocument.document_id,
                  document_metadata: updatedDocument,
                  assignments: idbDoc.assignments,
                  clientLastUpdated: newClientLastUpdated,
                })
                .catch(err => {
                  console.error('Failed to update IDB with num_communities:', err);
                });
            }
          })
          .catch(err => {
            console.error('Failed to get IDB document:', err);
          });
      }
    },
    setCommunities: communities => {
      const {mapDocument, updated} = get();
      if (!mapDocument) return;
      const count = Math.max(0, communities.length);
      const newColorScheme = extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        Math.max(count, mapDocument.num_districts ?? 0, getHighestCommunityId(communities))
      );
      const nextCommunities = normalizeCommunities({
        communities,
        count,
        colorScheme: newColorScheme,
      });
      const syncedColorScheme = syncCoiColorsToColorScheme(nextCommunities, newColorScheme);
      const updatedDocument = {
        ...mapDocument,
        num_communities: count,
        community_metadata_list: nextCommunities,
        color_scheme: syncedColorScheme,
      };
      set({
        mapDocument: updatedDocument,
        numCommunities: count,
        communities: nextCommunities,
        updated: {
          ...updated,
          metadata: true,
        },
      });
    },
    addCommunity: options => {
      const {mapDocument, updated, communities} = get();
      if (!mapDocument) return;
      const orderedCommunities = sortCommunitiesByRenderOrder(communities);
      const nextCount = communities.length + 1;
      const nextCommunityId = getNextCommunityId(orderedCommunities);
      const trimmedName = options?.name?.trim();
      const trimmedColor = options?.color?.trim();
      const nextDescription = sanitizeCommunityDescription(
        options?.description,
        mapDocument.comment_length_limit ?? 240
      );
      const currentComments = mapDocument.document_comments ?? [];
      const newColorScheme = extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        Math.max(nextCount, mapDocument.num_districts ?? 0, nextCommunityId)
      );
      const nextCommunities = [
        ...orderedCommunities,
        {
          id: nextCommunityId,
          render_order_id: orderedCommunities.length + 1,
          name: trimmedName || getNextCommunityName(orderedCommunities),
          description: nextDescription,
          color: trimmedColor || getNextUnusedCommunityColor(orderedCommunities, newColorScheme),
          createdAt: new Date().toISOString(),
        },
      ];
      const initialCommunityComment: DocumentComment = {
        comment_id: crypto.randomUUID(),
        zone: nextCommunityId,
        text: nextDescription,
      };
      nextCommunities[nextCommunities.length - 1].descriptionCommentId =
        initialCommunityComment.comment_id;
      const syncedColorScheme = syncCoiColorsToColorScheme(nextCommunities, newColorScheme);
      const updatedDocument = {
        ...mapDocument,
        num_communities: nextCount,
        community_metadata_list: nextCommunities,
        color_scheme: syncedColorScheme,
        document_comments: [...currentComments, initialCommunityComment],
      };
      const clientLastUpdated = new Date().toISOString();
      set({
        mapDocument: updatedDocument,
        numCommunities: nextCount,
        communities: nextCommunities,
        updated: {
          metadata: true,
          comments: true,
        },
      });
      useCoiAssignmentsStore.getState().ensureCommunityVisibility(nextCommunityId);
      useMapControlsStore.getState().setSelectedZone(nextCommunityId);
      useCoiAssignmentsStore.getState().syncCommunitiesAndTimestamp(clientLastUpdated);
      if (mapDocument.document_id) {
        idb
          .getDocument(mapDocument.document_id)
          .then(idbDoc => {
            idb.updateDocument({
              id: mapDocument.document_id,
              document_metadata: updatedDocument,
              assignments: idbDoc?.assignments ?? [],
              clientLastUpdated,
            });
          })
          .catch(err => {
            console.error('Failed to update IDB with community_metadata_list:', err);
          });
      }
    },
    updateCommunity: (communityId, options) => {
      const {mapDocument, updated, communities} = get();
      if (!mapDocument) return;

      const orderedCommunities = sortCommunitiesByRenderOrder(communities);
      const currentCommunity = orderedCommunities.find(community => community.id === communityId);
      if (!currentCommunity) return;

      const nextName = options.name?.trim() || currentCommunity.name;
      const nextColor = options.color?.trim() || currentCommunity.color;
      const nextDescription = sanitizeCommunityDescription(
        options.description,
        mapDocument.comment_length_limit ?? 240
      );
      const syncedDescriptionComment = syncCommunityDescriptionComment({
        comments: mapDocument.document_comments ?? [],
        communityId,
        currentDescription: currentCommunity.description,
        nextDescription,
        descriptionCommentId: currentCommunity.descriptionCommentId,
      });
      const nextCommunities = orderedCommunities.map(community =>
        community.id === communityId
          ? {
              ...community,
              name: nextName,
              color: nextColor,
              description: nextDescription,
              descriptionCommentId: syncedDescriptionComment.descriptionCommentId,
            }
          : community
      );
      const metadataChanged =
        nextName !== currentCommunity.name ||
        nextColor !== currentCommunity.color ||
        nextDescription !== currentCommunity.description ||
        syncedDescriptionComment.descriptionCommentId !== currentCommunity.descriptionCommentId;

      if (!metadataChanged && !syncedDescriptionComment.changed) {
        return;
      }

      const newColorScheme = extendColorArray(
        mapDocument.color_scheme ?? DefaultColorScheme,
        Math.max(mapDocument.num_districts ?? 0, getHighestCommunityId(nextCommunities))
      );
      const syncedColorScheme = syncCoiColorsToColorScheme(nextCommunities, newColorScheme);
      const updatedDocument = {
        ...mapDocument,
        community_metadata_list: nextCommunities,
        color_scheme: syncedColorScheme,
        document_comments: syncedDescriptionComment.comments,
      };
      const clientLastUpdated = new Date().toISOString();

      set({
        mapDocument: updatedDocument,
        communities: nextCommunities,
        updated: {
          metadata: updated.metadata || metadataChanged,
          comments: updated.comments || syncedDescriptionComment.changed,
        },
      });

      useCoiAssignmentsStore.getState().syncCommunitiesAndTimestamp(clientLastUpdated);

      if (mapDocument.document_id) {
        idb
          .getDocument(mapDocument.document_id)
          .then(idbDoc => {
            if (!idbDoc) return;
            idb.updateDocument({
              id: mapDocument.document_id,
              document_metadata: updatedDocument,
              assignments: idbDoc.assignments,
              clientLastUpdated,
            });
          })
          .catch(err => {
            console.error('Failed to update IDB after editing a COI community:', err);
          });
      }
    },
    removeCommunity: communityId => {
      const {mapDocument, communities, pinnedCommentZone} = get();
      if (!mapDocument || communities.length <= 0) return;
      const orderedCommunities = sortCommunitiesByRenderOrder(communities);
      const removedCommunityIndex = orderedCommunities.findIndex(
        community => community.id === communityId
      );
      if (removedCommunityIndex === -1) return;
      const remainingCommunities = removeCommunityAndShiftRenderOrder(
        orderedCommunities,
        communityId
      );
      const updatedComments = (mapDocument.document_comments ?? []).filter(
        comment => comment.zone !== communityId
      );

      const selectedZone = useMapControlsStore.getState().selectedZone;
      const neighboringCommunityId =
        remainingCommunities[removedCommunityIndex]?.id ??
        remainingCommunities[Math.max(0, removedCommunityIndex - 1)]?.id ??
        remainingCommunities[0]?.id ??
        1;

      const remappedSelectedZone =
        selectedZone === communityId ||
        !remainingCommunities.some(community => community.id === selectedZone)
          ? neighboringCommunityId
          : selectedZone;

      const remappedLockedZones = useMapControlsStore
        .getState()
        .mapOptions.lockPaintedAreas.filter(zone => zone !== communityId);

      const remappedPinnedZone = pinnedCommentZone === communityId ? null : pinnedCommentZone;
      const updatedDocument = {
        ...mapDocument,
        num_communities: remainingCommunities.length,
        community_metadata_list: remainingCommunities,
        color_scheme: syncCoiColorsToColorScheme(
          remainingCommunities,
          mapDocument.color_scheme ?? DefaultColorScheme
        ),
        document_comments: updatedComments,
      };

      const clientLastUpdated = new Date().toISOString();

      set({
        mapDocument: updatedDocument,
        numCommunities: remainingCommunities.length,
        communities: remainingCommunities,
        pinnedCommentZone: remappedPinnedZone,
        updated: {
          metadata: true,
          comments: true,
        },
      });

      useMapControlsStore.setState(state => ({
        selectedZone: remappedSelectedZone,
        mapOptions: {
          ...state.mapOptions,
          lockPaintedAreas: remappedLockedZones,
        },
      }));

      useCoiAssignmentsStore.getState().removeCommunity(communityId);

      if (mapDocument.document_id) {
        idb
          .getDocument(mapDocument.document_id)
          .then(idbDoc => {
            if (!idbDoc) return;
            idb.updateDocument({
              id: mapDocument.document_id,
              document_metadata: updatedDocument,
              assignments: idbDoc.assignments,
              clientLastUpdated,
            });
          })
          .catch(err => {
            console.error('Failed to update IDB after removing a COI community:', err);
          });
      }
    },
    handleShatter: async features => {
      const {mapDocument, mapLock, setMapLock} = get();
      if (!features.length) {
        setMapLock(null);
        return;
      }
      if (mapLock || !mapDocument?.districtr_map_slug) {
        return;
      }
      const {setMapOptions, mapMode} = useMapControlsStore.getState();
      temporalManager.pause(mapMode);
      setMapLock({isLocked: true, reason: 'Breaking districts'});
      // set BLOCK_LAYER_ID based on features[0] to focused true

      const geoids = features.map(f => f.id?.toString()).filter(Boolean) as string[];
      const edgesResult = await getChildEdges({
        districtr_map_slug: mapDocument.districtr_map_slug,
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
      const {
        shatterIds,
        parentToChild: currentParentToChild,
        childToParent: currentChildToParent,
      } = mapMode === 'coi' ? useCoiAssignmentsStore.getState() : useAssignmentsStore.getState();
      let parents = new Set(shatterIds.parents);
      let children = new Set(shatterIds.children);
      let captiveIds = new Set<string>();
      let parentToChild = new Map(currentParentToChild);
      let childToParent = new Map(currentChildToParent);
      const zonesToSet: Record<string, Set<string>> = {};
      edgesResult.forEach(edge => {
        parents.add(edge.parent_path);
        children.add(edge.child_path);
        captiveIds.add(edge.child_path);
        childToParent.set(edge.child_path, edge.parent_path);
        if (!zonesToSet[edge.parent_path]) {
          zonesToSet[edge.parent_path] = new Set([edge.child_path]);
        } else {
          zonesToSet[edge.parent_path].add(edge.child_path);
        }

        // Update parentToChild
        if (!parentToChild.has(edge.parent_path)) {
          parentToChild.set(edge.parent_path, new Set([edge.child_path]));
        } else {
          parentToChild.get(edge.parent_path)!.add(edge.child_path);
        }
      });
      // Need to shatter all communities that that have that assignment since they can overlap
      if (mapMode === 'coi') {
        const {
          communityAssignments: currentCommunityAssignments,
          setShatterState,
          replaceCommunityAssignments,
        } = useCoiAssignmentsStore.getState();
        const newCommunityAssignments = new Map<number, Set<string>>();
        currentCommunityAssignments.forEach((assignedGeoids, community) => {
          newCommunityAssignments.set(community, new Set(assignedGeoids));
        });
        Object.entries(zonesToSet).forEach(([parent, childSet]) => {
          newCommunityAssignments.forEach(assignedGeoids => {
            if (!assignedGeoids.has(parent)) return;
            assignedGeoids.delete(parent);
            childSet.forEach(childId => {
              assignedGeoids.add(childId);
            });
          });
        });
        setShatterState({
          shatterIds: {
            parents,
            children,
          },
          parentToChild,
          childToParent,
        });
        replaceCommunityAssignments(newCommunityAssignments);
      } else {
        // Path for original zone shatter
        const {zoneAssignments: currentZoneAssignments, setShatterState} =
          useAssignmentsStore.getState();
        const zoneAssignments = new Map(currentZoneAssignments);
        Object.entries(zonesToSet).forEach(([parent, childSet]) => {
          setZones(zoneAssignments, parent, childSet);
        });
        setShatterState({
          shatterIds: {
            parents,
            children,
          },
          parentToChild,
          childToParent,
          zoneAssignments,
        });
      }

      const featureBbox = features[0].geometry && bbox(features[0].geometry);
      const mapBbox =
        featureBbox?.length && featureBbox?.length >= 4
          ? (featureBbox.slice(0, 4) as maplibregl.LngLatBoundsLike)
          : undefined;

      set({
        mapLock: null,
        captiveIds,
        focusFeatures: [
          {
            id: features[0].id,
            source: BLOCK_SOURCE_ID,
            sourceLayer: mapDocument?.parent_layer,
          },
        ],
      });
      useMapControlsStore.setState({activeTool: 'brush'});
      setMapOptions({
        mode: 'break',
        bounds: mapBbox,
      });
    },
    handleReset: async () => {
      const {mapDocument, getMapRef} = get();
      const {zoneAssignments, resetZoneAssignments, shatterIds, resetShatterState} =
        useAssignmentsStore.getState();
      const document_id = mapDocument?.document_id;

      if (!document_id) {
        return;
      }
      set({
        mapLock: {isLocked: true, reason: 'Resetting map'},
        appLoadingState: 'loading',
      });
      const resetResponse = await patchUpdateReset(document_id);
      if (!resetResponse.ok) {
        set({
          errorNotification: {
            severity: 2,
            message:
              'Failed to reset map. Please refresh this page and try again. If this error persists, please share the error code below the Districtr team.',
          },
        });
        return;
      }

      if (resetResponse.response.document_id === document_id) {
        const initialState = useMapStore.getInitialState();
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
          mapLock: null,
        });
        useMapControlsStore.setState({activeTool: 'pan'});
      }
    },
    focusFeatures: [],
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
    updateMetadata: metadata => {
      const {mapDocument} = get();
      if (!mapDocument) {
        set({
          errorNotification: {
            severity: 2,
            message: 'Tried to update metadata on a map document that does not exist',
            id: 'updateMetadata-no-map-document',
          },
        });
        return;
      }
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
  })
);
