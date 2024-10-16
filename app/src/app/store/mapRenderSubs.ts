import { LngLatBoundsLike } from "maplibre-gl";
import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_SOURCE_ID,
  BLOCK_HOVER_LAYER_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFilter,
  getLayerFill,
} from "../constants/layers";
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  shallowCompareArray,
} from "../utils/helpers";
import { useMapStore as _useMapStore, MapStore } from "./mapStore";

const BBOX_TOLERANCE_DEG = 0.02;

export const getRenderSubscriptions = (useMapStore: typeof _useMapStore) => {
  const addLayerSubMapDocument = useMapStore.subscribe<
    [MapStore["mapDocument"], MapStore["mapRef"]]
  >(
    (state) => [state.mapDocument, state.mapRef],
    ([mapDocument, mapRef]) => {
      const mapStore = useMapStore.getState();
      if (mapRef?.current && mapDocument) {
        addBlockLayers(mapRef, mapDocument);
        mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
      }
    },
    { equalityFn: shallowCompareArray },
  );

  const _shatterMapSideEffectRender = useMapStore.subscribe<
    [MapStore["shatterIds"], MapStore["mapRef"], MapStore["mapRenderingState"]]
  >(
    (state) => [state.shatterIds, state.mapRef, state.mapRenderingState],
    ([shatterIds, mapRef, mapRenderingState]) => {
      const state = useMapStore.getState();
      const setMapLock = state.setMapLock;

      if (!mapRef?.current || mapRenderingState !== "loaded") {
        return;
      }

      const layersToFilter = PARENT_LAYERS;

      if (state.mapDocument?.child_layer) layersToFilter.push(...CHILD_LAYERS);

      layersToFilter.forEach((layerId) =>
        mapRef.current?.setFilter(layerId, getLayerFilter(layerId, shatterIds))
      );
      
      shatterIds.parents.forEach((id) => {
        mapRef.current?.removeFeatureState({
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer: state.mapDocument?.parent_layer,
        });
      });

      mapRef.current.once("render", () => {
        setMapLock(false);
        console.log(`Unlocked at`, performance.now());
      });
    },
    { equalityFn: shallowCompareArray }
  );

  const _lockBboxSub = useMapStore.subscribe(
    (state) => state.mapBbox,
    (mapBbox, previousMapBbox) => {
      const { mapRef, captiveIds, shatterIds } = useMapStore.getState();

      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach((layerId) => {
        layerId.includes("hover") &&
          mapRef?.current?.setPaintProperty?.(
            layerId,
            "fill-opacity",
            getLayerFill(
              mapBbox ? captiveIds : undefined,
              shatterIds.parents
            )
          );
      });

      if (!mapRef?.current && !mapBbox && !previousMapBbox) {
        return;
      }

      CHILD_LAYERS.forEach(layerId => {
        !layerId.includes("hover") &&  mapRef?.current?.setPaintProperty?.(
          layerId,
          "line-opacity",
          1
        );
      })
      const _bounds = (mapBbox || previousMapBbox)!;
      const tolerance = mapBbox ? BBOX_TOLERANCE_DEG * 2 : BBOX_TOLERANCE_DEG * 5;
      const maxBounds = [
        [_bounds[0] - tolerance, _bounds[1] - tolerance],
        [_bounds[2] + tolerance, _bounds[3] + tolerance],
      ] as LngLatBoundsLike;

      if (mapBbox) {
        mapRef?.current?.fitBounds(maxBounds);
      }
    }
  );

  const _hoverMapSideEffectRender = useMapStore.subscribe(
    (state) => state.hoverFeatures,
    (hoverFeatures, previousHoverFeatures) => {
      const mapRef = useMapStore.getState().mapRef;

      if (!mapRef?.current) {
        return;
      }

      previousHoverFeatures.forEach((feature) => {
        mapRef.current?.setFeatureState(feature, { hover: false });
      });

      hoverFeatures.forEach((feature) => {
        mapRef.current?.setFeatureState(feature, { hover: true });
      });
    }
  );

  const _zoneAssignmentMapSideEffectRender =
    useMapStore.subscribe<ColorZoneAssignmentsState>(
      (state) => [
        state.zoneAssignments,
        state.mapDocument,
        state.mapRef,
        state.shatterIds,
        state.appLoadingState,
        state.mapRenderingState,
      ],
      (curr, prev) => colorZoneAssignments(curr, prev),
      { equalityFn: shallowCompareArray }
    );

  return [
    addLayerSubMapDocument,
    _shatterMapSideEffectRender,
    _hoverMapSideEffectRender,
    _zoneAssignmentMapSideEffectRender,
  ];
};
