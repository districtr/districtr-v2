'use client';
import type {MapGeoJSONFeature, MapOptions} from 'maplibre-gl';
import {create} from 'zustand';
import {devtools, subscribeWithSelector, persist} from 'zustand/middleware';
import type {ActiveTool, MapFeatureInfo, NullableZone, SpatialUnit} from '../constants/types';
import {Zone, GDBPath} from '../constants/types';
import {
  Assignment,
  DistrictrMap,
  DocumentObject,
  ShatterResult,
  ZonePopulation,
} from '../utils/api/apiHandlers';
import maplibregl from 'maplibre-gl';
import type {MutableRefObject} from 'react';
import {QueryObserverResult, UseQueryResult} from '@tanstack/react-query';
import {
  ContextMenuState,
  LayerVisibility,
  PaintEventHandler,
  checkIfSameZone,
  getFeaturesInBbox,
  setZones,
} from '../utils/helpers';
import {getRenderSubscriptions} from './mapRenderSubs';
import {patchShatter, patchUnShatter} from '../utils/api/mutations';
import {getSearchParamsObersver} from '../utils/api/queryParamsListener';
import {getMapMetricsSubs} from './metricsSubs';
import {getMapEditSubs} from './mapEditSubs';
import bbox from '@turf/bbox';
import {BLOCK_SOURCE_ID} from '../constants/layers';
import {getMapViewsSubs} from '../utils/api/queries';
import {persistOptions} from './persistConfig';
import {onlyUnique} from '../utils/arrays';
import {DistrictrMapOptions} from './types';

const combineSetValues = (setRecord: Record<string, Set<unknown>>, keys?: string[]) => {
  const combinedSet = new Set<unknown>(); // Create a new set to hold combined values
  for (const key in setRecord) {
    if (setRecord.hasOwnProperty(key) && (!keys || keys?.includes(key))) {
      setRecord[key].forEach(value => combinedSet.add(value)); // Add each value to the combined set
    }
  }
  return combinedSet; // Return the combined set
};

const prodWrapper: typeof devtools = (store: any) => store;
const devwrapper = process.env.NODE_ENV === 'development' ? devtools : prodWrapper;

export interface MapStore {
  // LOAD AND RENDERING STATE TRACKING
  appLoadingState: 'loaded' | 'initializing' | 'loading';
  setAppLoadingState: (state: MapStore['appLoadingState']) => void;
  mapRenderingState: 'loaded' | 'initializing' | 'loading';
  setMapRenderingState: (state: MapStore['mapRenderingState']) => void;
  // MAP CANVAS REF AND CONTROLS
  getMapRef: () => maplibregl.Map | null;
  setMapRef: (map: MutableRefObject<maplibregl.Map | null>) => void;
  mapLock: boolean;
  setMapLock: (lock: boolean) => void;
  // MAP DOCUMENT
  mapViews: Partial<QueryObserverResult<DistrictrMap[], Error>>;
  setMapViews: (maps: MapStore['mapViews']) => void;
  mapDocument: DocumentObject | null;
  setMapDocument: (mapDocument: DocumentObject) => void;
  // SHATTERING
  captiveIds: Set<string>;
  shatterIds: {
    parents: Set<string>;
    children: Set<string>;
  };
  shatterMappings: Record<string, Set<string>>;
  exitBlockView: (lock?: boolean) => void;
  setShatterIds: (
    existingParents: Set<string>,
    existingChildren: Set<string>,
    newParent: string[],
    newChildren: Set<string>[],
    multipleShattered: boolean
  ) => void;
  handleShatter: (document_id: string, feautres: Array<Partial<MapGeoJSONFeature>>) => void;
  // Sends unshatter patches to server that remove the child assignments
  // and add parents under the specified zone
  processHealParentsQueue: (additionalIds?: string[]) => void;
  // Removes local shatter data and updates map view
  cleanUpBreakData: () => void;
  checkParentsToHeal: (parentsToHeal: MapStore['parentsToHeal']) => void;
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
  lockedFeatures: Set<string>;
  lockFeature: (id: string, lock: boolean) => void;
  lockFeatures: (ids: Set<string>, lock: boolean) => void;
  setLockedFeatures: (lockedFeatures: MapStore['lockedFeatures']) => void;
  // HOVERING
  hoverFeatures: Array<MapFeatureInfo>;
  setHoverFeatures: (features?: Array<MapGeoJSONFeature>) => void;
  // FOCUS
  focusFeatures: Array<MapFeatureInfo>;
  mapOptions: MapOptions & DistrictrMapOptions;
  setMapOptions: (options: Partial<MapStore['mapOptions']>) => void;
  // HIGHLIGHT
  toggleHighlightBrokenDistricts: (ids?: Set<string> | string[], _higlighted?: boolean) => void;
  toggleLockPaintedAreas: () => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  spatialUnit: SpatialUnit;
  setSpatialUnit: (unit: SpatialUnit) => void;
  selectedZone: Zone;
  setSelectedZone: (zone: Zone) => void;
  accumulatedBlockPopulations: Map<string, number>;
  resetAccumulatedBlockPopulations: () => void;
  zoneAssignments: Map<string, NullableZone>; // geoid -> zone
  setZoneAssignments: (zone: NullableZone, gdbPaths: Set<GDBPath>) => void;
  loadZoneAssignments: (assigments: Assignment[]) => void;
  resetZoneAssignments: () => void;
  zonePopulations: Map<Zone, number>;
  setZonePopulations: (zone: Zone, population: number) => void;
  accumulatedGeoids: Set<string>;
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
  mapMetrics: UseQueryResult<ZonePopulation[], Error> | null;
  setMapMetrics: (metrics: UseQueryResult<ZonePopulation[], Error> | null) => void;
  visibleLayerIds: string[];
  setVisibleLayerIds: (layerIds: string[]) => void;
  addVisibleLayerIds: (layerIds: string[]) => void;
  updateVisibleLayerIds: (layerIds: LayerVisibility[]) => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  userMaps: Array<DocumentObject & {name?: string}>;
  setUserMaps: (userMaps: MapStore['userMaps']) => void;
  upsertUserMap: (props: {
    documentId?: string;
    mapDocument?: MapStore['mapDocument'];
    userMapDocumentId?: string;
    userMapData?: MapStore['userMaps'][number];
  }) => void;
}

const initialLoadingState =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('document_id')
    ? 'loading'
    : 'initializing';

export const useMapStore = create(
  persist(
    devwrapper(
      subscribeWithSelector<MapStore>((set, get) => ({
        appLoadingState: initialLoadingState,
        setAppLoadingState: appLoadingState => set({appLoadingState}),
        mapRenderingState: 'initializing',
        setMapRenderingState: mapRenderingState => set({mapRenderingState}),
        captiveIds: new Set<string>(),
        exitBlockView: (lock: boolean = false) => {
          const {
            focusFeatures,
            captiveIds,
            mapOptions,
            zoneAssignments,
            shatterMappings,
            toggleHighlightBrokenDistricts,
            lockFeatures,
          } = get();

          set({
            captiveIds: new Set<string>(),
            focusFeatures: [],
            mapOptions: {
              ...mapOptions,
              mode: 'default',
            },
          });

          const parentId = focusFeatures?.[0].id?.toString();
          if (lock && parentId) {
            const hasDrawn = Array.from(shatterMappings[parentId]).some(
              id => !!zoneAssignments.get(id)
            );
            if (hasDrawn) {
              hasDrawn && lockFeatures(captiveIds, true);
              mapOptions.showBrokenDistricts && toggleHighlightBrokenDistricts([parentId], true);
            }
          }
        },
        getMapRef: () => null,
        setMapRef: mapRef => {
          set({
            getMapRef: () => mapRef.current,
            appLoadingState:
              initialLoadingState === 'initializing' ? 'loaded' : get().appLoadingState,
          });
        },
        mapLock: false,
        setMapLock: mapLock => set({mapLock}),
        mapViews: {isPending: true},
        setMapViews: mapViews => set({mapViews}),
        mapDocument: null,
        setMapDocument: mapDocument => {
          const currentMapDocument = get().mapDocument;
          if (currentMapDocument?.document_id === mapDocument.document_id) {
            return;
          }
          get().setFreshMap(true);
          get().resetZoneAssignments();
          get().upsertUserMap({
            mapDocument,
          });
          set({
            mapDocument: mapDocument,
            shatterIds: {parents: new Set(), children: new Set()},
          });
        },
        // TODO: Refactor to something like this
        // featureStates: {
        //   locked: [],
        //   hovered: [],
        //   focused: [],
        //   highlighted: []
        // },
        // setFeatureStates: (
        //   features, state, action
        // ) => {
        //   if
        // },
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
        handleShatter: async (document_id, features) => {
          if (!features.length) {
            console.log('NO FEATURES');
            return;
          }
          set({mapLock: true});
          // set BLOCK_LAYER_ID based on features[0] to focused true

          const geoids = features.map(f => f.id?.toString()).filter(Boolean) as string[];

          const shatterMappings = get().shatterMappings;
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
              });

          // TODO Need to return child edges even if the parent is already shattered
          // currently returns nothing
          const shatterIds = get().shatterIds;

          let existingParents = new Set(shatterIds.parents);
          let existingChildren = new Set(shatterIds.children);
          const newParent = shatterResult.parents.geoids;
          const newChildren = new Set(shatterResult.children.map(child => child.geo_id));

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
            mapLock: false,
            captiveIds: newChildren,
            focusFeatures: [
              {
                id: features[0].id,
                source: BLOCK_SOURCE_ID,
                sourceLayer: get().mapDocument?.parent_layer,
              },
            ],
            zoneAssignments,
            parentsToHeal: [...get().parentsToHeal, features?.[0]?.id?.toString() || '']
              .filter(onlyUnique)
              .filter(f => f.length),
            mapOptions: {
              ...get().mapOptions,
              mode: 'break',
              bounds: mapBbox
            },
          });
        },
        parentsToHeal: [],
        processHealParentsQueue: async (additionalIds = []) => {
          const {
            isPainting,
            parentsToHeal: _parentsToHeal,
            mapDocument,
            shatterMappings,
            zoneAssignments,
            shatterIds,
          } = get();
          const idsToCheck = [..._parentsToHeal, ...additionalIds];
          if (isPainting || !idsToCheck.length || !mapDocument) {
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
            });
            const newZoneAssignments = new Map(zoneAssignments);
            const newShatterIds = {
              parents: new Set(shatterIds.parents),
              children: new Set(shatterIds.children),
            };
            const childrenToRemove = parentsToHeal
              .map(f => shatterMappings[f.parentId])
              .filter(Boolean);

            childrenToRemove.forEach(childSet =>
              childSet.forEach(childId => {
                newZoneAssignments.delete(childId);
                newShatterIds.children.delete(childId);
              })
            );
            parentsToHeal.forEach(parent => {
              delete shatterMappings[parent.parentId];
              newShatterIds.parents.delete(parent.parentId);
              newZoneAssignments.set(parent.parentId, parent.zone!);
            });

            set({
              shatterIds: newShatterIds,
              mapLock: false,
              shatterMappings: {...shatterMappings}, // Update shatterMappings
              zoneAssignments: newZoneAssignments,
              parentsToHeal: [],
            });
          }
        },
        cleanUpBreakData: () => {},
        checkParentsToHeal: parentsToHeal => {
          set({
            parentsToHeal: [...get().parentsToHeal, ...parentsToHeal].filter(onlyUnique),
          });
        },
        shatterMappings: {},
        upsertUserMap: ({mapDocument, userMapData, userMapDocumentId}) => {
          let userMaps = [...get().userMaps];
          const mapViews = get().mapViews.data;
          if (mapDocument?.document_id && mapViews) {
            const documentIndex = userMaps.findIndex(
              f => f.document_id === mapDocument?.document_id
            );
            const documentInfo = mapViews.find(
              view => view.gerrydb_table_name === mapDocument.gerrydb_table
            );
            if (documentIndex !== -1) {
              userMaps[documentIndex] = {
                ...documentInfo,
                ...userMaps[documentIndex],
                ...mapDocument,
              };
            } else {
              userMaps = [{...mapDocument, ...documentInfo}, ...userMaps];
            }
          } else if (userMapDocumentId) {
            const i = userMaps.findIndex(map => map.document_id === userMapDocumentId);
            if (userMapData) {
              userMaps.splice(i, 1, userMapData); // Replace the map at index i with the new data
            } else {
              const urlParams = new URL(window.location.href).searchParams;
              urlParams.delete('document_id'); // Remove the document_id parameter
              window.history.pushState(
                {},
                '',
                window.location.pathname + '?' + urlParams.toString()
              ); // Update the URL without document_id
              userMaps.splice(i, 1);
            }
          }
          set({
            userMaps,
          });
        },
        shatterIds: {
          parents: new Set(),
          children: new Set(),
        },
        setShatterIds: (
          existingParents,
          existingChildren,
          newParent,
          newChildren,
          multipleShattered
        ) => {
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
        hoverFeatures: [],
        setHoverFeatures: _features => {
          const hoverFeatures = _features
            ? _features.map(f => ({
                source: f.source,
                sourceLayer: f.sourceLayer,
                id: f.id,
              }))
            : [];

          set({hoverFeatures});
        },
        focusFeatures: [],
        mapOptions: {
          center: [-98.5795, 39.8283],
          zoom: 3,
          pitch: 0,
          bearing: 0,
          container: '',
          showBrokenDistricts: false,
          mode: 'default',
          lockPaintedAreas: false,
        },
        setMapOptions: options => set({mapOptions: {...get().mapOptions, ...options}}),
        toggleHighlightBrokenDistricts: (_ids, _higlighted) => {
          const {shatterIds, mapOptions, getMapRef, mapDocument} = get();
          const mapRef = getMapRef();
          if (!mapRef || !mapDocument) return;
          const highlighted =
            _higlighted !== undefined ? _higlighted : !mapOptions?.showBrokenDistricts;
          const ids = _ids ? _ids : shatterIds.parents;
          // previous state - hide and set option to false
          ids.forEach((parentId: string) => {
            mapRef.setFeatureState(
              {
                id: parentId,
                source: BLOCK_SOURCE_ID,
                sourceLayer: mapDocument.parent_layer,
              },
              {
                highlighted,
              }
            );
          });
          set({
            mapOptions: {
              ...mapOptions,
              showBrokenDistricts: highlighted,
            },
          });
        },
        toggleLockPaintedAreas: () => {
          const {mapOptions} = get();
          set({
            mapOptions: {
              ...mapOptions,
              lockPaintedAreas: !mapOptions.lockPaintedAreas,
            },
          });
        },
        activeTool: 'pan',
        setActiveTool: tool => set({activeTool: tool}),
        spatialUnit: 'tract',
        setSpatialUnit: unit => set({spatialUnit: unit}),
        selectedZone: 1,
        setSelectedZone: zone => set({selectedZone: zone}),
        zoneAssignments: new Map(),
        accumulatedGeoids: new Set<string>(),
        setAccumulatedGeoids: accumulatedGeoids => set({accumulatedGeoids}),
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
        loadZoneAssignments: assignments => {
          const zoneAssignments = new Map<string, number>();
          const shatterIds = {
            parents: new Set<string>(),
            children: new Set<string>(),
          };
          const shatterMappings: MapStore['shatterMappings'] = {};

          assignments.forEach(assignment => {
            zoneAssignments.set(assignment.geo_id, assignment.zone);
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
          set({zoneAssignments, shatterIds, shatterMappings, appLoadingState: 'loaded'});
        },
        accumulatedBlockPopulations: new Map<string, number>(),
        resetAccumulatedBlockPopulations: () =>
          set({accumulatedBlockPopulations: new Map<string, number>()}),
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
        brushSize: 50,
        setBrushSize: size => set({brushSize: size}),
        isPainting: false,
        setIsPainting: isPainting => set({isPainting}),
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
        mapMetrics: null,
        setMapMetrics: metrics => set({mapMetrics: metrics}),
        visibleLayerIds: ['counties_boundary', 'counties_labels'],
        setVisibleLayerIds: layerIds => set({visibleLayerIds: layerIds}),
        addVisibleLayerIds: (layerIds: string[]) => {
          set(state => {
            const newVisibleLayerIds = new Set(state.visibleLayerIds);
            layerIds.forEach(layerId => {
              newVisibleLayerIds.add(layerId);
            });
            return {visibleLayerIds: Array.from(newVisibleLayerIds)};
          });
        },
        updateVisibleLayerIds: (layerVisibilities: LayerVisibility[]) => {
          set(state => {
            const newVisibleLayerIds = new Set(state.visibleLayerIds);
            layerVisibilities.forEach(layerVisibility => {
              if (layerVisibility.visibility === 'visible') {
                newVisibleLayerIds.add(layerVisibility.layerId);
              } else {
                newVisibleLayerIds.delete(layerVisibility.layerId);
              }
            });
            return {visibleLayerIds: Array.from(newVisibleLayerIds)};
          });
        },
        contextMenu: null,
        setContextMenu: contextMenu => set({contextMenu}),
        userMaps: [],
        setUserMaps: userMaps => set({userMaps}),
      }))
    ),
    persistOptions
  )
);

// these need to initialize after the map store
getRenderSubscriptions(useMapStore);
getMapMetricsSubs(useMapStore);
getMapViewsSubs(useMapStore);
getMapEditSubs(useMapStore);
getSearchParamsObersver();
