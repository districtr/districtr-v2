import {PARENT_LAYERS, CHILD_LAYERS, getLayerFill, BLOCK_SOURCE_ID} from '@constants/layers';
import {ColorZoneAssignmentsState} from '@utils/map/types';
import {colorZoneAssignments} from '@utils/map/colorZoneAssignments';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {shallowCompareArray} from '@utils/arrays';
import {useMapStore as _useMapStore, MapStore} from '@store/mapStore';
import {getFeatureUnderCursor} from '@utils/map/getFeatureUnderCursor';
import {useDemographyStore as _useDemographyStore} from '../../store/demography/demographyStore';
import {demographyCache} from '../demography/demographyCache';
import {FocusState, ShatterState} from './types';
import {
  useMapControlsStore as _useMapControlsStore,
  type MapControlsStore,
} from '@store/mapControlsStore';
import {useAssignmentsStore as _useAssignmentsStore} from '@store/assignmentsStore';

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
  controlSubscriptions: ReturnType<typeof _useMapControlsStore.subscribe>[] = [];
  assignmentSubscriptions: ReturnType<typeof _useAssignmentsStore.subscribe>[] = [];
  previousColorState?: ColorZoneAssignmentsState;

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
  }
  previousShatterState?: ShatterState;

  renderShatter() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();
    const assignmentsState = this.useAssignmentsStore.getState();
    const currentState: ShatterState = [
      assignmentsState.shatterIds,
      mapState.mapRenderingState,
      controlsState.mapOptions.highlightBrokenDistricts,
    ];
    const prevState = this.previousShatterState;
    const [shatterIds, mapRenderingState, highlightBrokenDistricts] = currentState;
    const prevShatterIds = prevState?.[0];
    const {mapDocument, appLoadingState, setMapLock} = mapState;
    if (mapRenderingState !== 'loaded' || appLoadingState !== 'loaded' || !mapDocument) {
      return;
    }
    // Hide broken parents on parent layer
    // Show broken children on child layer
    // remove zone from parents
    shatterIds.parents.forEach(id => {
      this.mapRef.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer: mapDocument?.parent_layer,
        },
        {
          broken: true,
          zone: null,
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
      setMapLock(false);
      console.log(`Unlocked at`, performance.now());
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
    // this.assignmentSubscriptions.push(
    //   this.useAssignmentsStore.subscribe(
    //     state => state.shatterIds,
    //     () => this.renderShatter()
    //   )
    // );
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
      const isParent = PARENT_LAYERS.includes(layerId);
      if (isHover && this.mapRef.getLayer(layerId)) {
        this.mapRef.setPaintProperty(
          layerId,
          'fill-opacity',
          getLayerFill(captiveIds.size ? captiveIds : undefined, !isParent, isDemographic)
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
    let cursor;
    switch (activeTool) {
      case 'pan':
        cursor = '';
        setPaintFunction(defaultPaintFunction);
        break;
      case 'brush':
        cursor = 'url(/paintbrush.png) 20 20, none';
        setPaintFunction(defaultPaintFunction);
        break;
      case 'eraser':
        cursor = 'url(/eraser.png) 16 16, pointer';
        setPaintFunction(defaultPaintFunction);
        break;
      case 'shatter':
        cursor = 'url(/break.png) 12 12, pointer';
        setPaintFunction(getFeatureUnderCursor);
        break;
      default:
        cursor = '';
    }
    this.mapRef.getCanvas().style.cursor = cursor;
  }
  subscribeCursor() {
    this.controlSubscriptions.push(
      this.useMapControlsStore.subscribe<MapControlsStore['activeTool']>(
        state => state.activeTool,
        this.renderCursor.bind(this)
      )
    );
  }
  renderColorZones() {
    const mapState = this.useMapStore.getState();
    const controlsState = this.useMapControlsStore.getState();
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
    colorZoneAssignments(this.mapRef, currentState, this.previousColorState);
    if (mapState.isTemporalAction) {
      demographyCache.updatePopulations(zoneAssignments);
    }
    const {captiveIds, mapRenderingState} = mapState;
    const {mapOptions} = controlsState;
    if (mapRenderingState !== 'loaded') {
      this.previousColorState = currentState;
      return;
    }
    [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
      const isHover = layerId.includes('hover');
      const isParent = PARENT_LAYERS.includes(layerId);

      if (isHover && this.mapRef.getLayer(layerId)) {
        this.mapRef.setPaintProperty(
          layerId,
          'fill-opacity',
          getLayerFill(
            captiveIds.size ? captiveIds : undefined,
            !isParent,
            mapOptions.showDemographicMap === 'overlay'
          )
        );
      }
    });
    this.previousColorState = currentState;
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
          state.mapOptions.lockPaintedAreas,
          state.mapOptions.showZoneNumbers,
          state.mapOptions.showDemographicMap,
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
    this.renderColorZones();
  }
  checkRender() {
    const mapState = this.useMapStore.getState();
    const mapRef = this.mapRef;
    const {zoneAssignments} = this.useAssignmentsStore.getState();
    if (zoneAssignments.size === 0) return;

    const nonNullAssignment = Array.from(zoneAssignments.entries()).find(f => f.values !== null);
    if (!nonNullAssignment) return;
    const [nonNullId, nonNullZone] = nonNullAssignment;

    const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]?._state?.state;
    if (!featureStateCache) return;

    const layers = Object.keys(featureStateCache);
    if (layers.length === 0) return;

    const stateIsApplied = layers.some(layer => {
      const layerData = featureStateCache[layer];
      const nonNullEntrydata = layerData[nonNullId];
      return nonNullEntrydata?.zone === nonNullZone;
    });

    if (!stateIsApplied) {
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
  }
  subscribe() {
    this.subscribeShatter();
    this.subscribeCursor();
    this.subscribeFocus();
    if (this.mapType === 'main') {
      this.subscribeColorZones();
    }
    this.render();
    console.log('Subscribed to map render subs', this.subscriptions.length);
  }

  unsubscribe() {
    console.log('Unsubscribing from map render subs', this.subscriptions.length);
    this.subscriptions.forEach(unsub => unsub());
    this.controlSubscriptions.forEach(unsub => unsub());
    this.assignmentSubscriptions.forEach(unsub => unsub());
    this.subscriptions = [];
    this.controlSubscriptions = [];
    this.assignmentSubscriptions = [];
  }
}
