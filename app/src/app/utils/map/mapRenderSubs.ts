import {PARENT_LAYERS, CHILD_LAYERS, getLayerFill, BLOCK_SOURCE_ID} from '@constants/layers';
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  getFeaturesInBbox,
  getFeaturesIntersectingCounties,
  shallowCompareArray,
} from '@utils/helpers';
import {useMapStore as _useMapStore, MapStore} from '@store/mapStore';
import {getFeatureUnderCursor} from '@utils/helpers';
import {useDemographyStore as _useDemographyStore} from '../../store/demographyStore';
import {useHoverStore as _useHoverStore, HoverFeatureStore} from '../../store/hoverFeatures';
import {demographyCache} from '../demography/demographyCache';
import {FocusState, ShatterState} from './types';

/**
 * A class that manages the rendering of the map based on the state of the map store.
 * This handles the subscriptions to the various stores and keeps a local reference of the store
 * so that this could be re-used with different map stores
 */
export class MapRenderSubscriber {
  mapRef: maplibregl.Map;
  mapType: 'demographic' | 'main' = 'main';
  useMapStore: typeof _useMapStore;
  useHoverStore: typeof _useHoverStore;
  useDemographyStore: typeof _useDemographyStore;
  subscriptions: ReturnType<typeof _useMapStore.subscribe>[] = [];

  constructor(
    mapRef: maplibregl.Map,
    mapType: 'demographic' | 'main' = 'main',
    useMapStore: typeof _useMapStore,
    useHoverStore: typeof _useHoverStore,
    useDemographyStore: typeof _useDemographyStore
  ) {
    this.mapRef = mapRef;
    this.mapType = mapType;
    this.useMapStore = useMapStore;
    this.useHoverStore = useHoverStore;
    this.useDemographyStore = useDemographyStore;
  }
  renderShatter(curr: ShatterState, prev?: ShatterState) {
    const [shatterIds, mapRenderingState, highlightBrokenDistricts] = curr;
    const [prevShatterIds] = prev || [];
    const {mapDocument, appLoadingState, setMapLock} = this.useMapStore.getState();
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
  }
  subscribeShatter() {
    this.subscriptions.push(
      this.useMapStore.subscribe<ShatterState>(
        state => [
          state.shatterIds,
          state.mapRenderingState,
          state.mapOptions.highlightBrokenDistricts,
        ],
        this.renderShatter.bind(this),
        {equalityFn: shallowCompareArray}
      )
    );
  }
  renderFocus(focusFeatures: FocusState, previousFocusFeatures?: FocusState) {
    const {captiveIds, shatterIds} = this.useMapStore.getState();

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
          getLayerFill(
            captiveIds.size ? captiveIds : undefined,
            isParent ? shatterIds.parents : undefined,
            !isParent,
            isDemographic
          )
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
  renderCursor(activeTool: MapStore['activeTool']) {
    const mapOptions = this.useMapStore.getState().mapOptions;
    const defaultPaintFunction = mapOptions.paintByCounty
      ? getFeaturesIntersectingCounties
      : getFeaturesInBbox;
    let cursor;
    switch (activeTool) {
      case 'pan':
        cursor = '';
        this.useMapStore.getState().setPaintFunction(defaultPaintFunction);
        break;
      case 'brush':
        cursor = 'url(paintbrush.png) 12 12, pointer';
        this.useMapStore.getState().setPaintFunction(defaultPaintFunction);
        break;
      case 'eraser':
        cursor = 'url(eraser.png) 16 16, pointer';
        this.useMapStore.getState().setPaintFunction(defaultPaintFunction);
        break;
      case 'shatter':
        cursor = 'url(break.png) 12 12, pointer';
        this.useMapStore.getState().setPaintFunction(getFeatureUnderCursor);
        break;
      case 'lock':
        cursor = 'url(lock.png) 12 12, pointer';
        this.useMapStore.getState().setPaintFunction(getFeatureUnderCursor);
        break;
      default:
        cursor = '';
    }
    this.mapRef.getCanvas().style.cursor = cursor;
  }
  subscribeCursor() {
    this.subscriptions.push(
      this.useMapStore.subscribe<MapStore['activeTool']>(
        state => state.activeTool,
        this.renderCursor.bind(this)
      )
    );
  }
  renderHover(
    hoverFeatures: HoverFeatureStore['hoverFeatures'],
    previousHoverFeatures?: HoverFeatureStore['hoverFeatures']
  ) {
    previousHoverFeatures?.forEach(feature => {
      this.mapRef.setFeatureState(feature, {hover: false});
    });
    hoverFeatures.forEach(feature => {
      this.mapRef.setFeatureState(feature, {hover: true});
    });
  }
  subscribeHover() {
    this.subscriptions.push(
      this.useHoverStore.subscribe(
        (state: HoverFeatureStore) => state.hoverFeatures,
        this.renderHover.bind(this)
      )
    );
  }
  renderLock(
    lockedFeatures: MapStore['lockedFeatures'],
    previousLockedFeatures?: MapStore['lockedFeatures']
  ) {
    const {shatterIds, mapDocument} = this.useMapStore.getState();
    if (!mapDocument) return;

    const getLayer = (id: string) => {
      const isChild = shatterIds.children.has(id);
      if (isChild && mapDocument.child_layer) {
        return mapDocument.child_layer;
      }
      return mapDocument.parent_layer;
    };

    lockedFeatures.forEach(id => {
      if (!previousLockedFeatures?.has(id)) {
        this.mapRef.setFeatureState(
          {
            id,
            source: BLOCK_SOURCE_ID,
            sourceLayer: getLayer(id),
          },
          {
            locked: true,
          }
        );
      }
    });

    previousLockedFeatures?.forEach(id => {
      if (!lockedFeatures.has(id)) {
        this.mapRef.setFeatureState(
          {
            id,
            source: BLOCK_SOURCE_ID,
            sourceLayer: getLayer(id),
          },
          {
            locked: false,
          }
        );
      }
    });
  }
  subscribeLock() {
    this.subscriptions.push(
      this.useMapStore.subscribe(state => state.lockedFeatures, this.renderLock.bind(this))
    );
  }
  renderColorZones(curr: ColorZoneAssignmentsState, prev?: ColorZoneAssignmentsState) {
    colorZoneAssignments(this.mapRef, curr, prev);
    if (this.useMapStore.getState().isTemporalAction) {
      demographyCache.updatePopulations(curr[0]);
    }
    const {
      captiveIds,
      shatterIds,
      setLockedFeatures,
      lockedFeatures,
      mapRenderingState,
      mapOptions,
    } = this.useMapStore.getState();
    if (mapRenderingState !== 'loaded') return;
    [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
      const isHover = layerId.includes('hover');
      const isParent = PARENT_LAYERS.includes(layerId);

      if (isHover && this.mapRef.getLayer(layerId)) {
        this.mapRef.setPaintProperty(
          layerId,
          'fill-opacity',
          getLayerFill(
            captiveIds.size ? captiveIds : undefined,
            isParent ? shatterIds.parents : undefined,
            !isParent,
            mapOptions.showDemographicMap === 'overlay'
          )
        );
      }
    });
    const [lockPaintedAreas, prevLockPaintedAreas] = [curr[5], prev?.[5]];
    const sameLockedAreas =
      JSON.stringify(lockPaintedAreas) === JSON.stringify(prevLockPaintedAreas);
    const zoneAssignments = curr[0];
    // if lockPaintedAreas, lock all zones
    if (lockPaintedAreas.length) {
      const previousWasArray = Array.isArray(prevLockPaintedAreas);
      const nonNullZones = new Set(
        [...zoneAssignments.entries()]
          .filter(
            ([key, value]) =>
              // locked zones include assignment zone
              lockPaintedAreas.includes(value) ||
              // locked zones are the same, and this individual feature was previously locked
              (sameLockedAreas && lockedFeatures.has(key)) ||
              // locked zones are changed, BUT this individual feature is not in a zone
              // that was previously locked
              (!sameLockedAreas &&
                previousWasArray &&
                !lockPaintedAreas.includes(value) &&
                !prevLockPaintedAreas.includes(value) &&
                lockedFeatures.has(key))
          )
          .map(([key]) => key)
      );
      setLockedFeatures(nonNullZones);
    } else if (!lockPaintedAreas.length && prevLockPaintedAreas) {
      setLockedFeatures(new Set());
    }
  }
  subscribeColorZones() {
    this.subscriptions.push(
      this.useMapStore.subscribe<ColorZoneAssignmentsState>(
        state => [
          state.zoneAssignments,
          state.mapDocument,
          state.shatterIds,
          state.appLoadingState,
          state.mapRenderingState,
          state.mapOptions.lockPaintedAreas,
          state.mapOptions.showZoneNumbers,
        ],
        this.renderColorZones.bind(this),
        {equalityFn: shallowCompareArray}
      )
    );
  }
  render() {
    const mapState = this.useMapStore.getState();
    const hoverState = this.useHoverStore.getState();

    this.renderShatter([
      mapState.shatterIds,
      mapState.mapRenderingState,
      mapState.mapOptions.highlightBrokenDistricts,
    ]);
    this.renderCursor(mapState.activeTool);
    this.renderHover(hoverState.hoverFeatures);
    this.renderLock(mapState.lockedFeatures);
    this.renderFocus(mapState.focusFeatures);
    if (this.mapType === 'main') {
      this.renderColorZones([
        mapState.zoneAssignments,
        mapState.mapDocument,
        mapState.shatterIds,
        mapState.appLoadingState,
        mapState.mapRenderingState,
        mapState.mapOptions.lockPaintedAreas,
        mapState.mapOptions.showZoneNumbers,
      ]);
    }
  }
  subscribe() {
    this.subscribeShatter();
    this.subscribeCursor();
    this.subscribeHover();
    this.subscribeLock();
    this.subscribeFocus();
    if (this.mapType === 'main') {
      this.subscribeColorZones();
    }
    this.render.bind(this)();
    console.log("Subscribed to map render subs", this.subscriptions.length);
  }

  unsubscribe() {
    console.log("Unsubscribing from map render subs", this.subscriptions.length);
    this.subscriptions.forEach(unsub => unsub());
  }
}
