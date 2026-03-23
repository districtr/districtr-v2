import {getLayerFill} from '@constants/map/layerStyle';
import {PARENT_LAYERS, CHILD_LAYERS, BLOCK_SOURCE_ID} from '@constants/map/layerIds';
import {ColorZoneAssignmentsState} from '@utils/map/types';
import {colorZoneAssignments} from '@utils/map/colorZoneAssignments';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {shallowCompareArray} from '@utils/arrays';
import {useMapStore as _useMapStore} from '@store/mapStore';
import {getFeatureUnderCursor} from '@utils/map/getFeatureUnderCursor';
import {useDemographyStore as _useDemographyStore} from '../../store/demography/demographyStore';
import {demographyCache} from '../demography/demographyCache';
import {FocusState, ShatterState} from './types';
import {
  useMapControlsStore as _useMapControlsStore,
  type MapControlsStore,
} from '@store/mapControlsStore';
import {useAssignmentsStore as _useAssignmentsStore} from '@store/assignmentsStore';
import {useCoiAssignmentsStore} from '@store/coiAssignmentsStore';
import {Zone} from '@constants/types';
import {getCommunityFeatureStateKey, getPrimaryCommunityId} from '../communities';
import GeometryWorker from '../GeometryWorker';

/**
 * A class that manages the rendering of the map based on the state of the map store.
 * This handles the subscriptions to the various stores and keeps a local reference of the store
 * so that this could be re-used with different map stores
 */
export class MapRenderSubscriber {
  mapRef: maplibregl.Map;
  mapType: 'demographic' | 'main' = 'main';
  useMapStore: typeof _useMapStore;
  useDemographyStore: typeof _useDemographyStore;
  subscriptions: ReturnType<typeof _useMapStore.subscribe>[] = [];
  useMapControlsStore: typeof _useMapControlsStore;
  useAssignmentsStore: typeof _useAssignmentsStore;
  useCoiAssignmentsStore: typeof useCoiAssignmentsStore;
  controlSubscriptions: ReturnType<typeof _useMapControlsStore.subscribe>[] = [];
  assignmentSubscriptions: ReturnType<typeof _useAssignmentsStore.subscribe>[] = [];
  demographySubscriptions: ReturnType<typeof _useDemographyStore.subscribe>[] = [];
  // Needed since we won't get implicit updates like the assignment subscription will
  demographySourceDataListener?: (e: any) => void;
  previousColorState?: ColorZoneAssignmentsState;
  previousCommunityAssignments?: Map<string, Set<Zone>>;
  previousCommunityShatterIds?: {
    parents: Set<string>;
    children: Set<string>;
  };

  constructor(
    mapRef: maplibregl.Map,
    mapType: 'demographic' | 'main' = 'main',
    useMapStore: typeof _useMapStore = _useMapStore,
    useDemographyStore: typeof _useDemographyStore = _useDemographyStore,
    useMapControlsStore: typeof _useMapControlsStore = _useMapControlsStore,
    useAssignmentsStore: typeof _useAssignmentsStore = _useAssignmentsStore
  ) {
    this.mapRef = mapRef;
    this.mapType = mapType;
    this.useMapStore = useMapStore;
    this.useDemographyStore = useDemographyStore;
    this.useMapControlsStore = useMapControlsStore;
    this.useAssignmentsStore = useAssignmentsStore;
    this.useCoiAssignmentsStore = useCoiAssignmentsStore;
  }
  previousShatterState?: ShatterState;

  renderShatter() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();
    const assignmentsState = this.useAssignmentsStore.getState();
    const coiAssignmentsState = this.useCoiAssignmentsStore.getState();
    const isCoiMode = controlsState.mapMode === 'coi';
    const shatterIds = isCoiMode ? coiAssignmentsState.shatterIds : assignmentsState.shatterIds;
    const communitiesByGeoid = isCoiMode
      ? this.mapCommunitiesByGeoid(coiAssignmentsState.communityAssignments)
      : undefined;
    const currentState: ShatterState = [
      shatterIds,
      mapState.mapRenderingState,
      controlsState.mapOptions.highlightBrokenDistricts,
    ];
    const prevState = this.previousShatterState;
    const [, mapRenderingState, highlightBrokenDistricts] = currentState;
    const prevShatterIds = prevState?.[0];
    const {mapDocument, appLoadingState, setMapLock} = mapState;
    if (mapRenderingState !== 'loaded' || appLoadingState !== 'loaded' || !mapDocument) {
      return;
    }
    // Hide broken parents on parent layer
    // Show broken children on child layer
    // remove zone from parents
    shatterIds.parents.forEach(id => {
      const resetCommunityKeys: Record<string, boolean> = {};
      if (communitiesByGeoid) {
        communitiesByGeoid.get(id)?.forEach(communityId => {
          const featureStateKey = this.getCommunityFeatureStateKey(communityId);
          resetCommunityKeys[featureStateKey] = false;
        });
      }
      this.mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer: mapDocument?.parent_layer,
        },
        {
          broken: true,
          zone: null,
          community: null,
          ...resetCommunityKeys,
          highlighted: highlightBrokenDistricts,
        }
      );
    });
    prevShatterIds?.parents.forEach((parentId: string) => {
      if (!shatterIds.parents.has(parentId)) {
        this.mapRef.setFeatureState(
          {
            id: parentId,
            source: BLOCK_SOURCE_ID,
            sourceLayer: mapDocument.parent_layer,
          },
          {
            highlighted: false,
            broken: false,
          }
        );
      }
    });

    this.mapRef.once('render', () => {
      setMapLock(null);
    });
    this.previousShatterState = currentState;
  }
  subscribeShatter() {
    this.subscriptions.push(
      this.useMapStore.subscribe(
        state => [state.mapRenderingState, state.appLoadingState],
        () => this.renderShatter(),
        {equalityFn: shallowCompareArray}
      )
    );
    this.assignmentSubscriptions.push(
      this.useAssignmentsStore.subscribe(
        state => state.shatterIds,
        () => this.renderShatter()
      )
    );
    this.assignmentSubscriptions.push(
      this.useCoiAssignmentsStore.subscribe(
        state => state.shatterIds,
        () => this.renderShatter()
      )
    );
    this.controlSubscriptions.push(
      this.useMapControlsStore.subscribe(
        controls => controls.mapOptions.highlightBrokenDistricts,
        () => this.renderShatter()
      )
    );
    this.renderShatter();
  }
  renderFocus(focusFeatures: FocusState, previousFocusFeatures?: FocusState) {
    const {captiveIds} = this.useMapStore.getState();

    focusFeatures.forEach(feature => {
      this.mapRef.setFeatureState(feature, {focused: true});
    });
    previousFocusFeatures?.forEach(feature => {
      if (!focusFeatures.find(f => f.id === feature.id)) {
        this.mapRef.setFeatureState(feature, {focused: false});
      }
    });

    const isDemographic = this.mapType === 'demographic';

    if (isDemographic) return;
    [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
      const isHover = layerId.includes('hover');
      if (isHover && this.mapRef.getLayer(layerId)) {
        this.mapRef.setPaintProperty(
          layerId,
          'fill-opacity',
          getLayerFill(captiveIds.size ? captiveIds : undefined, isDemographic)
        );
      }
    });

    CHILD_LAYERS.forEach(layerId => {
      if (!layerId.includes('hover') && this.mapRef.getLayer(layerId)) {
        this.mapRef.setPaintProperty(layerId, 'line-opacity', 1);
      }
    });
  }
  subscribeFocus() {
    this.subscriptions.push(
      this.useMapStore.subscribe(store => store.focusFeatures, this.renderFocus.bind(this))
    );
  }
  renderCursor(activeTool: MapControlsStore['activeTool']) {
    const {mapOptions, setPaintFunction} = this.useMapControlsStore.getState();
    const defaultPaintFunction = mapOptions.paintByCounty
      ? getFeaturesIntersectingCounties
      : getFeaturesInBbox;
    switch (activeTool) {
      case 'pan':
      case 'brush':
      case 'eraser':
        setPaintFunction(defaultPaintFunction);
        break;
      case 'shatter':
        setPaintFunction(getFeatureUnderCursor);
        break;
      default:
    }
  }
  subscribeCursor() {
    this.controlSubscriptions.push(
      this.useMapControlsStore.subscribe<MapControlsStore['activeTool']>(
        state => state.activeTool,
        this.renderCursor.bind(this)
      )
    );
  }
  mapCommunitiesByGeoid(communityAssignments: Map<Zone, Set<string>>) {
    const geoidToCommunities = new Map<string, Set<Zone>>();
    communityAssignments.forEach((geoids, community) => {
      geoids.forEach(geoid => {
        const curr = geoidToCommunities.get(geoid);
        if (curr) {
          curr.add(community);
          return;
        }
        geoidToCommunities.set(geoid, new Set([community]));
      });
    });
    return geoidToCommunities;
  }
  getPrimaryCommunity(communities: Set<Zone>) {
    return getPrimaryCommunityId(communities, this.useMapStore.getState().communities);
  }
  toPrimaryAssignments(geoidToCommunities: Map<string, Set<Zone>>) {
    const primaryAssignments = new Map<string, Zone>();
    geoidToCommunities.forEach((communities, geoid) => {
      const primary = this.getPrimaryCommunity(communities);
      if (primary !== null) {
        primaryAssignments.set(geoid, primary);
      }
    });
    return primaryAssignments;
  }
  cloneCommunitiesByGeoid(input: Map<string, Set<Zone>>) {
    return new Map(
      Array.from(input.entries()).map(([geoid, communities]) => [geoid, new Set(communities)])
    );
  }
  updatePreviousCommunitySnapshot(
    assignmentsByGeoid: Map<string, Set<Zone>>,
    shatterIds: {parents: Set<string>; children: Set<string>}
  ) {
    this.previousCommunityAssignments = this.cloneCommunitiesByGeoid(assignmentsByGeoid);
    this.previousCommunityShatterIds = {
      parents: new Set(shatterIds.parents),
      children: new Set(shatterIds.children),
    };
  }
  applyHoverLayerOpacityFinalPass(
    captiveIds: Set<string>,
    showDemographicMap: MapControlsStore['mapOptions']['showDemographicMap']
  ) {
    // Keep hover-layer opacity aligned with focus/break mode and overlay mode.
    // Color rendering can run independently of focus updates, so we re-assert this here.
    [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
      if (!layerId.includes('hover') || !this.mapRef.getLayer(layerId)) return;
      this.mapRef.setPaintProperty(
        layerId,
        'fill-opacity',
        getLayerFill(captiveIds.size ? captiveIds : undefined, showDemographicMap === 'overlay')
      );
    });
  }
  checkCommunitySetsEqual(left: Set<Zone>, right: Set<Zone>) {
    if (left.size !== right.size) return false;
    for (const community of left) {
      if (!right.has(community)) return false;
    }
    return true;
  }
  getSourceLayerForGeoid(
    geoid: string,
    shatterIds: {children: Set<string>},
    mapDocument: {parent_layer: string; child_layer: string | null}
  ) {
    return shatterIds.children.has(geoid) ? mapDocument.child_layer : mapDocument.parent_layer;
  }
  getCommunityFeatureStateKey(communityId: Zone) {
    return getCommunityFeatureStateKey(communityId) ?? `community_${communityId}`;
  }
  buildDesiredCommunityState(communities: Set<Zone>) {
    const primary = this.getPrimaryCommunity(communities);
    const desired: Record<string, unknown> = {
      selected: primary !== null,
      community: primary,
      zone: primary,
    };
    communities.forEach(communityId => {
      desired[this.getCommunityFeatureStateKey(communityId)] = true;
    });
    return desired;
  }
  getCurrentOrPendingFeatureStateValue(
    featureState: Record<string, unknown> | undefined,
    pendingFeatureState: Record<string, unknown> | undefined,
    key: string
  ) {
    if (pendingFeatureState && key in pendingFeatureState) {
      return pendingFeatureState[key];
    }
    return featureState?.[key];
  }
  isCommunityStateUpToDate(
    featureState: Record<string, unknown> | undefined,
    pendingFeatureState: Record<string, unknown> | undefined,
    desiredState: Record<string, unknown>,
    communities: Set<Zone>
  ) {
    const desiredCommunity = desiredState.community;
    const desiredZone = desiredState.zone;
    if (
      this.getCurrentOrPendingFeatureStateValue(featureState, pendingFeatureState, 'community') !==
      desiredCommunity
    ) {
      return false;
    }
    if (
      this.getCurrentOrPendingFeatureStateValue(featureState, pendingFeatureState, 'zone') !==
      desiredZone
    ) {
      return false;
    }
    for (const communityId of communities) {
      if (
        this.getCurrentOrPendingFeatureStateValue(
          featureState,
          pendingFeatureState,
          this.getCommunityFeatureStateKey(communityId)
        ) !== true
      ) {
        return false;
      }
    }
    return true;
  }
  buildCommunityFeatureStateUpdate(prevCommunities: Set<Zone>, newCommunities: Set<Zone>) {
    const newPrimary = this.getPrimaryCommunity(newCommunities);
    const updatedKeys = new Set<string>();
    const featureState: Record<string, unknown> = {
      selected: newPrimary !== null,
      community: newPrimary,
      zone: newPrimary,
    };
    prevCommunities.forEach(communityId => {
      updatedKeys.add(this.getCommunityFeatureStateKey(communityId));
    });
    newCommunities.forEach(communityId => {
      updatedKeys.add(this.getCommunityFeatureStateKey(communityId));
    });
    updatedKeys.forEach(key => {
      featureState[key] = false;
    });
    newCommunities.forEach(communityId => {
      featureState[this.getCommunityFeatureStateKey(communityId)] = true;
    });
    return featureState;
  }
  renderColorCommunities() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();
    const coiAssignmentsState = this.useCoiAssignmentsStore.getState();
    const {communityAssignments, shatterIds} = coiAssignmentsState;

    // When painting, don't render colors because that is handled by the hover logic.
    if (controlsState.isPainting) {
      return;
    }

    const newAssignmentsByGeoid = this.mapCommunitiesByGeoid(communityAssignments);
    const previousAssignmentsByGeoid = this.previousCommunityAssignments || new Map();
    const prevShatterIds = this.previousCommunityShatterIds || shatterIds;
    const isInitialRender = this.previousCommunityAssignments === undefined;

    const newPrimaryAssignments = this.toPrimaryAssignments(newAssignmentsByGeoid);
    GeometryWorker?.updateZones(Array.from(newPrimaryAssignments.entries()));
    const coalitionGroups = this.useDemographyStore.getState().coalitionGroups;
    demographyCache.updatePopulations(undefined, coalitionGroups);

    if (mapState.mapRenderingState !== 'loaded' || mapState.appLoadingState !== 'loaded') {
      this.updatePreviousCommunitySnapshot(newAssignmentsByGeoid, shatterIds);
      return;
    }

    const featureStateCache = this.mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    const featureStateChangesCache =
      this.mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.stateChanges;
    if (!featureStateCache || !mapState.mapDocument) return;
    const mapDocument = mapState.mapDocument;

    newAssignmentsByGeoid.forEach((newCommunities, geoid) => {
      if (!geoid) return;
      const sourceLayer = this.getSourceLayerForGeoid(geoid, shatterIds, mapDocument);
      if (!sourceLayer) return;
      const prevCommunities = previousAssignmentsByGeoid.get(geoid) || new Set<Zone>();
      const desiredState = this.buildDesiredCommunityState(newCommunities);

      const featureState = featureStateCache[sourceLayer]?.[geoid] as
        | Record<string, unknown>
        | undefined;
      const futureState = featureStateChangesCache?.[sourceLayer]?.[geoid] as
        | Record<string, unknown>
        | undefined;
      if (
        !isInitialRender &&
        this.checkCommunitySetsEqual(prevCommunities, newCommunities) &&
        this.isCommunityStateUpToDate(featureState, futureState, desiredState, newCommunities)
      ) {
        return;
      }

      this.mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: geoid,
          sourceLayer,
        },
        this.buildCommunityFeatureStateUpdate(prevCommunities, newCommunities)
      );
    });

    previousAssignmentsByGeoid.forEach((prevCommunities, geoid) => {
      if (newAssignmentsByGeoid.has(geoid)) return;
      const sourceLayer = this.getSourceLayerForGeoid(geoid, prevShatterIds, mapDocument);
      if (!sourceLayer) return;
      this.mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: geoid,
          sourceLayer,
        },
        this.buildCommunityFeatureStateUpdate(prevCommunities, new Set<Zone>())
      );
    });

    this.applyHoverLayerOpacityFinalPass(
      mapState.captiveIds,
      controlsState.mapOptions.showDemographicMap
    );
    this.updatePreviousCommunitySnapshot(newAssignmentsByGeoid, shatterIds);
  }
  renderColorZones() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();
    if (controlsState.mapMode === 'coi') {
      this.previousColorState = undefined;
      this.renderColorCommunities();
      return;
    }

    this.previousCommunityAssignments = undefined;
    this.previousCommunityShatterIds = undefined;

    const assignmentsState = this.useAssignmentsStore.getState();
    const zoneAssignments = assignmentsState.zoneAssignments;
    const shatterIds = assignmentsState.shatterIds;
    const currentState: ColorZoneAssignmentsState = [
      zoneAssignments,
      mapState.mapDocument,
      shatterIds,
      mapState.appLoadingState,
      mapState.mapRenderingState,
      controlsState.mapOptions.lockPaintedAreas,
      controlsState.mapOptions.showZoneNumbers,
    ];
    // When painting, don't render colors
    if (controlsState.isPainting) {
      return;
    }
    // Always update GeometryWorker zones to keep it in sync
    GeometryWorker?.updateZones(Array.from(zoneAssignments.entries()));

    // Update demography cache
    const coalitionGroups = this.useDemographyStore.getState().coalitionGroups;
    demographyCache.updatePopulations(zoneAssignments, coalitionGroups);

    // Only render colors if map is fully loaded
    if (mapState.mapRenderingState !== 'loaded' || mapState.appLoadingState !== 'loaded') {
      this.previousColorState = currentState;
      return;
    }

    const renderSuccess = colorZoneAssignments(this.mapRef, currentState, this.previousColorState);
    if (renderSuccess) {
      this.previousColorState = currentState;
    }

    this.applyHoverLayerOpacityFinalPass(
      mapState.captiveIds,
      controlsState.mapOptions.showDemographicMap
    );
  }
  subscribeColorZones() {
    this.subscriptions.push(
      this.useMapStore.subscribe(
        state => [state.mapDocument, state.appLoadingState, state.mapRenderingState],
        () => this.renderColorZones(),
        {equalityFn: shallowCompareArray}
      )
    );
    this.controlSubscriptions.push(
      this.useMapControlsStore.subscribe(
        state => [
          state.mapMode,
          state.mapOptions.lockPaintedAreas,
          state.mapOptions.showZoneNumbers,
          state.mapOptions.showDemographicMap,
          state.isPainting,
        ],
        () => this.renderColorZones(),
        {equalityFn: shallowCompareArray}
      )
    );
    this.assignmentSubscriptions.push(
      this.useAssignmentsStore.subscribe(
        state => state.zoneAssignments,
        () => this.renderColorZones()
      )
    );
    this.assignmentSubscriptions.push(
      this.useCoiAssignmentsStore.subscribe(
        state => [state.communityAssignments, state.shatterIds],
        () => this.renderColorZones(),
        {equalityFn: shallowCompareArray}
      )
    );
    // Subscribe to mapRenderingState changes to ensure rendering happens
    // when map becomes loaded after assignments are already loaded
    this.subscriptions.push(
      this.useMapStore.subscribe(
        state => state.mapRenderingState,
        mapRenderingState => {
          const mapState = this.useMapStore.getState();
          const controlsState = this.useMapControlsStore.getState();
          const assignmentsState = this.useAssignmentsStore.getState();
          const coiAssignmentsState = this.useCoiAssignmentsStore.getState();
          const hasCommunityAssignments = Array.from(
            coiAssignmentsState.communityAssignments.values()
          ).some(geoids => geoids.size > 0);
          // If map just became loaded and we have assignments, ensure rendering
          if (
            mapRenderingState === 'loaded' &&
            mapState.appLoadingState === 'loaded' &&
            ((controlsState.mapMode === 'coi' && hasCommunityAssignments) ||
              (controlsState.mapMode !== 'coi' && assignmentsState.zoneAssignments.size > 0))
          ) {
            // Use requestAnimationFrame to ensure map is fully ready
            requestAnimationFrame(() => {
              this.renderColorZones();
            });
          }
        }
      )
    );
    this.renderColorZones();
  }
  renderDemographyColors() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();
    const demographyState = this.useDemographyStore.getState();

    const demographyEnabled =
      this.mapType === 'demographic' || controlsState.mapOptions.showDemographicMap === 'overlay';
    if (!demographyEnabled || !mapState.mapDocument) return;

    const mapScale = demographyCache.calculateDemographyColorScale({
      variable: demographyState.variable,
      variant: demographyState.variant,
      mapRef: this.mapRef,
      mapDocument: mapState.mapDocument,
      numberOfBins: demographyState.numberOfBins || 5,
      paintMap: true,
      coalitionGroups: demographyState.coalitionGroups,
    });
    if (mapScale) {
      demographyState.setScale(mapScale);
    }
  }
  subscribeDemographyColors() {
    this.subscriptions.push(
      this.useMapStore.subscribe(
        state => [state.mapDocument, state.appLoadingState, state.mapRenderingState],
        () => this.renderDemographyColors(),
        {equalityFn: shallowCompareArray}
      )
    );
    this.controlSubscriptions.push(
      this.useMapControlsStore.subscribe(
        state => state.mapOptions.showDemographicMap,
        () => this.renderDemographyColors()
      )
    );
    this.demographySubscriptions.push(
      this.useDemographyStore.subscribe(
        state => [
          state.variable,
          state.variant,
          state.numberOfBins,
          state.dataHash,
          state.coalitionHash,
        ],
        () => this.renderDemographyColors(),
        {equalityFn: shallowCompareArray}
      )
    );
    this.assignmentSubscriptions.push(
      this.useAssignmentsStore.subscribe(
        state => state.shatterIds,
        () => this.renderDemographyColors()
      )
    );
    this.assignmentSubscriptions.push(
      this.useCoiAssignmentsStore.subscribe(
        state => state.shatterIds,
        () => this.renderDemographyColors()
      )
    );
    if (!this.demographySourceDataListener) {
      this.demographySourceDataListener = (e: any) => {
        if (e?.sourceId === BLOCK_SOURCE_ID && e?.isSourceLoaded) {
          this.renderDemographyColors();
        }
      };
      this.mapRef.on('sourcedata', this.demographySourceDataListener);
    }
    this.renderDemographyColors();
  }
  subscribeBasemap() {
    this.controlSubscriptions.push(
      this.useMapControlsStore.subscribe(
        controls => controls.mapOptions.basemap,
        () => {
          this.mapRef.once('idle', () => {
            this.render();
          });
        }
      )
    );
  }
  checkRender() {
    const mapRef = this.mapRef;
    const mapState = this.useMapStore.getState();
    const {isPainting, mapMode} = this.useMapControlsStore.getState();
    if (!mapRef || !mapState.mapDocument?.document_id || isPainting) return;
    const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    if (!featureStateCache) return;

    if (
      mapState.mapRenderingState !== 'loaded' ||
      mapState.appLoadingState !== 'loaded' ||
      !mapState.mapDocument
    ) {
      return;
    }
    const mapDocument = mapState.mapDocument;

    if (mapMode === 'coi') {
      const {communityAssignments, clientLastUpdated, shatterIds} =
        this.useCoiAssignmentsStore.getState();
      if (!clientLastUpdated.length) {
        return;
      }

      const assignmentsByGeoid = this.mapCommunitiesByGeoid(communityAssignments);
      if (assignmentsByGeoid.size === 0) return;

      const assignmentsToCheck = Array.from(assignmentsByGeoid.entries())
        .filter(([, communities]) => communities.size > 0)
        .slice(0, 10);
      if (assignmentsToCheck.length === 0) return;

      const needsRender = assignmentsToCheck.some(([id, communities]) => {
        const sourceLayer = this.getSourceLayerForGeoid(id, shatterIds, mapDocument);
        if (!sourceLayer) return false;
        const layerData = featureStateCache[sourceLayer];
        if (!layerData) return true;
        const featureState = layerData[id];
        if (!featureState) return true;
        const primaryCommunity = this.getPrimaryCommunity(communities);
        if (primaryCommunity === null) return false;
        if (featureState.community !== primaryCommunity || featureState.zone !== primaryCommunity) {
          return true;
        }
        for (const community of communities) {
          const featureStateKey = this.getCommunityFeatureStateKey(community);
          if (featureState[featureStateKey] !== true) {
            return true;
          }
        }
        return false;
      });
      if (needsRender) {
        this.render();
      }
      return;
    }

    const {zoneAssignments, clientLastUpdated, shatterIds} = this.useAssignmentsStore.getState();
    if (!clientLastUpdated.length) {
      return;
    }

    if (zoneAssignments.size === 0) return;

    const assignmentsToCheck = Array.from(zoneAssignments.entries())
      .filter(([, zone]) => zone !== null)
      .slice(0, 10);

    if (assignmentsToCheck.length === 0) return;

    const needsRender = assignmentsToCheck.some(([id, zone]) => {
      const sourceLayer = this.getSourceLayerForGeoid(id, shatterIds, mapDocument);
      if (!sourceLayer) return false;

      const layerData = featureStateCache[sourceLayer];
      if (!layerData) return true;

      const featureState = layerData[id];
      return !featureState || featureState.zone !== zone;
    });

    if (needsRender) {
      this.render();
    }
  }
  render() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();

    this.renderShatter();
    this.renderCursor(controlsState.activeTool);
    this.renderFocus(mapState.focusFeatures);
    if (this.mapType === 'main') {
      this.renderColorZones();
    }
    this.renderDemographyColors();
  }
  subscribe() {
    this.subscribeShatter();
    this.subscribeBasemap();
    this.subscribeCursor();
    this.subscribeFocus();
    this.subscribeDemographyColors();
    if (this.mapType === 'main') {
      this.subscribeColorZones();
    }
    this.render();
  }

  unsubscribe() {
    this.subscriptions.forEach(unsub => unsub());
    this.controlSubscriptions.forEach(unsub => unsub());
    this.assignmentSubscriptions.forEach(unsub => unsub());
    this.demographySubscriptions.forEach(unsub => unsub());
    if (this.demographySourceDataListener) {
      this.mapRef.off('sourcedata', this.demographySourceDataListener);
      this.demographySourceDataListener = undefined;
    }
    this.subscriptions = [];
    this.controlSubscriptions = [];
    this.assignmentSubscriptions = [];
    this.demographySubscriptions = [];
  }
}
