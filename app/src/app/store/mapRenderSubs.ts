import { LngLat, LngLatBounds, LngLatBoundsLike } from "maplibre-gl";
import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFilter,
  getLayerFill,
} from "../constants/layers";
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  getMap,
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
    { equalityFn: shallowCompareArray }
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

      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach((layerId) => {
        mapRef.current?.setFilter(layerId, getLayerFilter(layerId, shatterIds));
      });

      mapRef.current.once("render", () => {
        setMapLock(false);
        console.log(`Unlocked at`, performance.now());
      });
    },
    { equalityFn: shallowCompareArray }
  );

  const lockBboxSub = useMapStore.subscribe(
    (state) => state.mapBbox,
    (mapBbox, previousMapBbox) => {
      const { mapRef, captiveIds } = useMapStore.getState();

      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach((layerId) => {
        layerId.includes("hover") &&
          mapRef?.current?.setPaintProperty?.(
            layerId,
            "fill-opacity",
            getLayerFill(mapBbox ? captiveIds : undefined)
          );
      });

      console.log("!!!BBOX changed", mapBbox, previousMapBbox);
      if (!mapRef?.current && !mapBbox && !previousMapBbox) {
        mapRef?.current?.setMaxBounds(undefined);
        return;
      }

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
