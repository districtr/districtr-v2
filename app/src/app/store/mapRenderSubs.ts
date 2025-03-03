import {PARENT_LAYERS, CHILD_LAYERS, getLayerFill, BLOCK_SOURCE_ID} from '@constants/layers';
import {saveColorScheme} from '@utils/api/apiHandlers';
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  getFeaturesInBbox,
  getFeaturesIntersectingCounties,
  shallowCompareArray,
} from '@utils/helpers';
import {useMapStore as _useMapStore, HoverFeatureStore, MapStore} from '@store/mapStore';
import {getFeatureUnderCursor} from '@utils/helpers';
import {useHoverStore as _useHoverStore} from '@store/mapStore';
import {calcPops} from '@utils/population';
import {useChartStore} from '@store/chartStore';

export const getRenderSubscriptions = (
  useMapStore: typeof _useMapStore,
  useHoverStore: typeof _useHoverStore
) => {
  const _addColorSchemeSub = useMapStore.subscribe<MapStore['colorScheme']>(
    state => state.colorScheme,
    colorScheme => {
      const {mapDocument} = useMapStore.getState();
      if (mapDocument) {
        saveColorScheme({document_id: mapDocument.document_id, colors: colorScheme});
      }
    },
    {equalityFn: shallowCompareArray}
  );

  const _shatterMapSideEffectRender = useMapStore.subscribe<
    [
      MapStore['shatterIds'],
      MapStore['getMapRef'],
      MapStore['mapRenderingState'],
      MapStore['mapOptions']['highlightBrokenDistricts'],
    ]
  >(
    state => [
      state.shatterIds,
      state.getMapRef,
      state.mapRenderingState,
      state.mapOptions.highlightBrokenDistricts,
    ],
    ([shatterIds, getMapRef, mapRenderingState, highlightBrokenDistricts], [prevShatterIds]) => {
      const {mapDocument, appLoadingState, setMapLock} = useMapStore.getState();
      const mapRef = getMapRef();
      if (
        !mapRef ||
        mapRenderingState !== 'loaded' ||
        appLoadingState !== 'loaded' ||
        !mapDocument
      ) {
        return;
      }
      // Hide broken parents on parent layer
      // Show broken children on child layer
      // remove zone from parents
      shatterIds.parents.forEach(id => {
        mapRef?.setFeatureState(
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
      prevShatterIds.parents.forEach((parentId: string) => {
        if (!shatterIds.parents.has(parentId)) {
          mapRef.setFeatureState(
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

      mapRef.once('render', () => {
        setMapLock(false);
        console.log(`Unlocked at`, performance.now());
      });
    },
    {equalityFn: shallowCompareArray}
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
      state.mapOptions.showZoneNumbers,
    ],
    (curr, prev) => {
      colorZoneAssignments(curr, prev);
      if (useMapStore.getState().isTemporalAction) {
        useChartStore.getState().setMapMetrics({
          data: calcPops(curr[0]),
        } as any);
      }
      const {
        captiveIds,
        shatterIds,
        getMapRef,
        setLockedFeatures,
        lockedFeatures,
        mapRenderingState,
      } = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || mapRenderingState !== 'loaded') return;
      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(layerId => {
        const isHover = layerId.includes('hover');
        const isParent = PARENT_LAYERS.includes(layerId);

        if (isHover && mapRef.getLayer(layerId)) {
          mapRef.setPaintProperty(
            layerId,
            'fill-opacity',
            getLayerFill(
              captiveIds.size ? captiveIds : undefined,
              isParent ? shatterIds.parents : undefined
            )
          );
        }
      });
      const [lockPaintedAreas, prevLockPaintedAreas] = [curr[6], prev[6]];
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
      const mapOptions = useMapStore.getState().mapOptions;
      const defaultPaintFunction = mapOptions.paintByCounty
        ? getFeaturesIntersectingCounties
        : getFeaturesInBbox;
      let cursor;
      switch (activeTool) {
        case 'pan':
          cursor = '';
          useMapStore.getState().setPaintFunction(defaultPaintFunction);
          break;
        case 'brush':
          cursor = 'url(paintbrush.png) 12 12, pointer';
          useMapStore.getState().setPaintFunction(defaultPaintFunction);
          break;
        case 'eraser':
          cursor = 'url(eraser.png) 16 16, pointer';
          useMapStore.getState().setPaintFunction(defaultPaintFunction);
          break;
        case 'shatter':
          cursor = 'url(break.png) 12 12, pointer';
          useMapStore.getState().setPaintFunction(getFeatureUnderCursor);
          break;
        case 'lock':
          cursor = 'url(lock.png) 12 12, pointer';
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
        if (isHover && mapRef.getLayer(layerId)) {
          mapRef.setPaintProperty(
            layerId,
            'fill-opacity',
            getLayerFill(
              captiveIds.size ? captiveIds : undefined,
              isParent ? shatterIds.parents : undefined
            )
          );
        }
      });

      CHILD_LAYERS.forEach(layerId => {
        if (!layerId.includes('hover') && mapRef.getLayer(layerId)) {
          mapRef.setPaintProperty(layerId, 'line-opacity', 1);
        }
      });
    }
  );

  const _hoverMapSideEffectRender = useHoverStore.subscribe(
    (state: HoverFeatureStore) => state.hoverFeatures,
    (
      hoverFeatures: HoverFeatureStore['hoverFeatures'],
      previousHoverFeatures: HoverFeatureStore['hoverFeatures']
    ) => {
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

  return [
    _shatterMapSideEffectRender,
    _zoneAssignmentMapSideEffectRender,
    _hoverMapSideEffectRender,
    _updateMapCursor,
    _applyFocusFeatureState,
    _addColorSchemeSub,
  ];
};
