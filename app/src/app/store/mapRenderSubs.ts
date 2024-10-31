import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFilter,
} from '@constants/layers';
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  shallowCompareArray,
} from '../utils/helpers';
import {useMapStore as _useMapStore, MapStore} from '@store/mapStore';
import {getFeatureUnderCursor} from '@utils/helpers';

export const getRenderSubscriptions = (useMapStore: typeof _useMapStore) => {
  const addLayerSubMapDocument = useMapStore.subscribe<
    [MapStore['mapDocument'], MapStore['getMapRef']]
  >(
    state => [state.mapDocument, state.getMapRef],
    ([mapDocument, getMapRef]) => {
      const mapStore = useMapStore.getState();
      const mapRef = getMapRef();
      if (mapRef && mapDocument) {
        addBlockLayers(mapRef, mapDocument);
        mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
      }
    },
    {equalityFn: shallowCompareArray}
  );

  const _shatterMapSideEffectRender = useMapStore.subscribe<
    [MapStore['shatterIds'], MapStore['getMapRef'], MapStore['mapRenderingState']]
  >(
    state => [state.shatterIds, state.getMapRef, state.mapRenderingState],
    ([shatterIds, getMapRef, mapRenderingState]) => {
      const state = useMapStore.getState();
      const mapRef = getMapRef();
      const setMapLock = state.setMapLock;

      if (!mapRef || mapRenderingState !== 'loaded') {
        return;
      }

      const layersToFilter = PARENT_LAYERS;

      if (state.mapDocument?.child_layer) layersToFilter.push(...CHILD_LAYERS);

      layersToFilter.forEach(layerId =>
        mapRef.setFilter(layerId, getLayerFilter(layerId, shatterIds))
      );

      mapRef.once('render', () => {
        setMapLock(false);
        console.log(`Unlocked at`, performance.now());
      });
    },
    {equalityFn: shallowCompareArray}
  );

  const _hoverMapSideEffectRender = useMapStore.subscribe(
    state => state.hoverFeatures,
    (hoverFeatures, previousHoverFeatures) => {
      const mapRef = useMapStore.getState().getMapRef();

      if (!mapRef) {
        return;
      }

      previousHoverFeatures.forEach(feature => {
        mapRef.setFeatureState(feature, {hover: false});
      });

      hoverFeatures.forEach(feature => {
        mapRef.setFeatureState(feature, {hover: true});
      });
    }
  );

  const _zoneAssignmentMapSideEffectRender = useMapStore.subscribe<ColorZoneAssignmentsState>(
    state => [
      state.zoneAssignments,
      state.mapDocument,
      state.getMapRef,
      state.shatterIds,
      state.appLoadingState,
      state.mapRenderingState,
    ],
    (curr, prev) => colorZoneAssignments(curr, prev),
    {equalityFn: shallowCompareArray}
  );

  const _updateMapCursor = useMapStore.subscribe<MapStore['activeTool']>(
    state => state.activeTool,
    activeTool => {
      const mapRef = useMapStore.getState().getMapRef();
      if (!mapRef) return;
      switch (activeTool) {
        case 'shatter':
          useMapStore.getState().setPaintFunction(getFeatureUnderCursor);
          break;
        default:
      }
    }
  );

  return [
    addLayerSubMapDocument,
    _shatterMapSideEffectRender,
    _hoverMapSideEffectRender,
    _zoneAssignmentMapSideEffectRender,
    _updateMapCursor,
  ];
};
