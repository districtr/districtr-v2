import {LngLatBoundsLike} from 'maplibre-gl';
import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFilter,
  getLayerFill,
  BLOCK_SOURCE_ID,
  BLOCK_LAYER_ID_HIGHLIGHT,
  getHighlightLayerSpecification,
} from '../constants/layers';
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  shallowCompareArray,
} from '../utils/helpers';
import {useMapStore as _useMapStore, MapStore} from '@store/mapStore';
import {getFeatureUnderCursor} from '@utils/helpers';

const BBOX_TOLERANCE_DEG = 0.02;

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
      const {mapDocument, appLoadingState, setMapLock} = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || mapRenderingState !== 'loaded' || appLoadingState !== 'loaded') {
        return;
      }

      const layersToFilter = mapDocument?.child_layer ? CHILD_LAYERS : [];

      if (mapDocument?.child_layer) layersToFilter.push(...CHILD_LAYERS);
      // Hide broken parents on parent layer
      // Show broken children on child layer
      layersToFilter.forEach(layerId =>
        mapRef.setFilter(layerId, getLayerFilter(layerId, shatterIds))
      );
      // remove zone from parents
      shatterIds.parents.forEach(id => {
        mapRef?.removeFeatureState({
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer: mapDocument?.parent_layer,
        });
      });

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
      state.mapOptions.lockPaintedAreas,
    ],
    (curr, prev) => {
      colorZoneAssignments(curr, prev);
      const {captiveIds, shatterIds, getMapRef, setLockedFeatures, mapRenderingState} =
        useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || mapRenderingState !== 'loaded') return;
      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
        const isHover = layerId.includes('hover');
        const isParent = PARENT_LAYERS.includes(layerId);
        isHover &&
          mapRef.setPaintProperty(
            layerId,
            'fill-opacity',
            getLayerFill(
              captiveIds.size ? captiveIds : undefined,
              isParent ? shatterIds.parents : undefined
            )
          );
      });
      const [lockPaintedAreas, prevLockPaintedAreas] = [curr[6], prev[6]];
      const zoneAssignments = curr[0];
      // if lockPaintedAreas, lock all zones
      if (lockPaintedAreas === true) {
        const nonNullZones = new Set(
          [...zoneAssignments.entries()]
            .filter(([key, value]) => value !== null)
            .map(([key]) => key)
        );
        setLockedFeatures(new Set(nonNullZones));
        // now unlocked, was previously locked
      } else if (Array.isArray(lockPaintedAreas)) {
        const nonNullZones = new Set(
          [...zoneAssignments.entries()]
            .filter(([key, value]) => lockPaintedAreas.includes(value))
            .map(([key]) => key)
        );
        setLockedFeatures(new Set(nonNullZones));
      } else if (!lockPaintedAreas && prevLockPaintedAreas) {
        setLockedFeatures(new Set());
      }
    },
    {equalityFn: shallowCompareArray}
  );

  const lockFeaturesSub = useMapStore.subscribe(
    state => state.lockedFeatures,
    (lockedFeatures, previousLockedFeatures) => {
      const {getMapRef, shatterIds, mapDocument} = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || !mapDocument) return;

      const getLayer = (id: string) => {
        const isChild = shatterIds.children.has(id);
        if (isChild && mapDocument.child_layer) {
          return mapDocument.child_layer;
        }
        return mapDocument.parent_layer;
      };

      lockedFeatures.forEach(id => {
        if (!previousLockedFeatures.has(id)) {
          mapRef.setFeatureState(
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

      previousLockedFeatures.forEach(id => {
        if (!lockedFeatures.has(id)) {
          mapRef.setFeatureState(
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
  );
  const _updateMapCursor = useMapStore.subscribe<MapStore['activeTool']>(
    state => state.activeTool,
    activeTool => {
      const mapRef = useMapStore.getState().getMapRef();
      if (!mapRef) return;
      let cursor;
      switch (activeTool) {
        case 'pan':
          cursor = '';
          break;
        case 'brush':
          cursor = 'pointer';
          break;
        case 'eraser':
          cursor = 'pointer';
          break;
        case 'shatter':
          cursor = 'crosshair';
          useMapStore.getState().setPaintFunction(getFeatureUnderCursor);
          break;
        case 'lock':
          cursor = 'crosshair';
          useMapStore.getState().setPaintFunction(getFeatureUnderCursor);
          break;
        default:
          cursor = '';
      }
      mapRef.getCanvas().style.cursor = cursor;
    }
  );

  const _applyFocusFeatureState = useMapStore.subscribe(
    store => store.focusFeatures,
    (focusFeatures, previousFocusFeatures) => {
      const {getMapRef, captiveIds, shatterIds} = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef) return;

      focusFeatures.forEach(feature => {
        mapRef.setFeatureState(feature, {focused: true});
      });
      previousFocusFeatures.forEach(feature => {
        if (!focusFeatures.find(f => f.id === feature.id)) {
          mapRef.setFeatureState(feature, {focused: false});
        }
      });

      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
        const isHover = layerId.includes('hover');
        const isParent = PARENT_LAYERS.includes(layerId);
        isHover &&
          mapRef.setPaintProperty(
            layerId,
            'fill-opacity',
            getLayerFill(
              captiveIds.size ? captiveIds : undefined,
              isParent ? shatterIds.parents : undefined
            )
          );
      });

      CHILD_LAYERS.forEach(layerId => {
        !layerId.includes('hover') && mapRef.setPaintProperty(layerId, 'line-opacity', 1);
      });
    }
  );

  const highlightUnassignedSub = useMapStore.subscribe(
    state => state.mapOptions.higlightUnassigned,
    (higlightUnassigned) => {
      const {getMapRef, mapDocument} = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || !mapDocument?.parent_layer) return;
      // set the layer BLOCK_LAYER_ID_HIGHLIGHT style to be the return from getHighlightLayerSpecification
      const highlightLayerSpecification = getHighlightLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID_HIGHLIGHT, higlightUnassigned)
      if (!highlightLayerSpecification.paint) return
      mapRef.setPaintProperty(BLOCK_LAYER_ID_HIGHLIGHT, 'line-width', highlightLayerSpecification['paint']['line-width']);
      mapRef.setPaintProperty(BLOCK_LAYER_ID_HIGHLIGHT, 'line-color', highlightLayerSpecification['paint']['line-color']);
    }
  );
  return [
    addLayerSubMapDocument,
    _shatterMapSideEffectRender,
    _hoverMapSideEffectRender,
    _zoneAssignmentMapSideEffectRender,
    _updateMapCursor,
    _applyFocusFeatureState,
    highlightUnassignedSub,
  ];
};
