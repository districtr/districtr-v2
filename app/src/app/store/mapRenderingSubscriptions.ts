import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
} from "../constants/layers";
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  shallowCompareArray,
} from "../utils/helpers";
import { useMapStore as _useMapStore } from "./mapStore";

export const getSubscriptions = (useMapStore: typeof _useMapStore) => {
  const addLayerSubMapDocument = useMapStore.subscribe(
    (state) => state.mapDocument,
    (mapDocument) => {
      const mapStore = useMapStore.getState();
      if (mapStore.mapRef && mapDocument) {
        addBlockLayers(mapStore.mapRef, mapDocument);
        mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
      }
    }
  );

  const addLayerSubMapRef = useMapStore.subscribe(
    (state) => state.mapRef,
    (mapRef) => {
      const mapStore = useMapStore.getState();
      if (mapRef && mapStore.mapDocument) {
        addBlockLayers(mapRef, mapStore.mapDocument);
        mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
      }
    }
  );

  const _shatterMapSideEffectRender = useMapStore.subscribe(
    (state) => state.shatterIds,
    (shatterIds) => {
      const state = useMapStore.getState();
      const mapRef = state.mapRef;
      const setMapLock = state.setMapLock;

      if (!mapRef?.current) {
        return;
      }

      PARENT_LAYERS.forEach((layerId) =>
        mapRef.current?.setFilter(layerId, [
          "!",
          ["in", ["get", "path"], ["literal", Array.from(shatterIds.parents)]],
        ])
      );

      CHILD_LAYERS.forEach((layerId) =>
        mapRef.current?.setFilter(layerId, [
          "in",
          ["get", "path"],
          ["literal", Array.from(shatterIds.children)],
        ])
      );

      mapRef.current.once("render", () => {
        setMapLock(false);
        console.log(`Unlocked at`, performance.now());
      });
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
      ],
      (curr, prev) => colorZoneAssignments(curr, prev),
      { equalityFn: shallowCompareArray }
    );

  return [
    addLayerSubMapDocument,
    addLayerSubMapRef,
    _shatterMapSideEffectRender,
    _hoverMapSideEffectRender,
    _zoneAssignmentMapSideEffectRender,
  ];
};
