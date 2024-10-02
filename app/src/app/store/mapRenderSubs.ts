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
import { useMapStore as _useMapStore, MapStore } from "./mapStore";

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

  const _shatterMapSideEffectRender = useMapStore.subscribe(
    (state) => state.shatterIds,
    (shatterIds) => {
      const state = useMapStore.getState();
      const mapRef = state.mapRef;
      const setMapLock = state.setMapLock;

      if (!mapRef?.current) {
        return;
      }
      console.log("Setting filter")
      
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
        state.appLoadingState,
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
