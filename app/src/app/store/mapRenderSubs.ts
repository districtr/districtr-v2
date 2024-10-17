import { LngLatBoundsLike } from "maplibre-gl";
import {
  addBlockLayers,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFilter,
  getLayerFill,
  BLOCK_SOURCE_ID,
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
    [MapStore["mapDocument"], MapStore["getMapRef"]]
  >(
    (state) => [state.mapDocument, state.getMapRef],
    ([mapDocument, getMapRef]) => {
      const mapStore = useMapStore.getState();
      const mapRef = getMapRef();
      if (mapRef && mapDocument) {
        addBlockLayers(mapRef, mapDocument);
        mapStore.addVisibleLayerIds([BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]);
      }
    },
    { equalityFn: shallowCompareArray }
  );

  const _shatterMapSideEffectRender = useMapStore.subscribe<
    [
      MapStore["shatterIds"],
      MapStore["getMapRef"],
      MapStore["mapRenderingState"]
    ]
  >(
    (state) => [state.shatterIds, state.getMapRef, state.mapRenderingState],
    ([shatterIds, getMapRef, mapRenderingState]) => {
      const state = useMapStore.getState();
      const mapRef = getMapRef();
      const setMapLock = state.setMapLock;

      if (!mapRef || mapRenderingState !== "loaded") {
        return;
      }

      const layersToFilter = state.mapDocument?.child_layer ? CHILD_LAYERS : [];

      layersToFilter.forEach((layerId) =>
        mapRef.setFilter(layerId, getLayerFilter(layerId, shatterIds))
      );

      shatterIds.parents.forEach((id) => {
        mapRef.removeFeatureState({
          source: BLOCK_SOURCE_ID,
          id,
          sourceLayer: state.mapDocument?.parent_layer,
        });
      });

      mapRef.once("render", () => {
        setMapLock(false);
        console.log(`Unlocked at`, performance.now());
      });
    },
    { equalityFn: shallowCompareArray }
  );

  const _hoverMapSideEffectRender = useMapStore.subscribe(
    (state) => state.hoverFeatures,
    (hoverFeatures, previousHoverFeatures) => {
      const mapRef = useMapStore.getState().getMapRef();

      if (!mapRef) {
        return;
      }

      previousHoverFeatures.forEach((feature) => {
        mapRef.setFeatureState(feature, { hover: false });
      });

      hoverFeatures.forEach((feature) => {
        mapRef.setFeatureState(feature, { hover: true });
      });
    }
  );

  const _zoneAssignmentMapSideEffectRender =
    useMapStore.subscribe<ColorZoneAssignmentsState>(
      (state) => [
        state.zoneAssignments,
        state.mapDocument,
        state.getMapRef,
        state.shatterIds,
        state.appLoadingState,
        state.mapRenderingState,
      ],
      (curr, prev) => {
        colorZoneAssignments(curr, prev);
        const { mapBbox, captiveIds, shatterIds, getMapRef } =
          useMapStore.getState();

        [...PARENT_LAYERS, ...CHILD_LAYERS].forEach((layerId) => {
          const isHover = layerId.includes("hover");
          const isParent = PARENT_LAYERS.includes(layerId);
          isHover &&
            getMapRef()?.setPaintProperty(
              layerId,
              "fill-opacity",
              getLayerFill(
                mapBbox ? captiveIds : undefined,
                isParent ? shatterIds.parents : undefined
              )
            );
        });
      },
      { equalityFn: shallowCompareArray }
    );

  const _lockBboxSub = useMapStore.subscribe(
    (state) => state.mapBbox,
    (mapBbox, previousMapBbox) => {
      const { getMapRef, captiveIds, shatterIds } = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef) return;

      [...PARENT_LAYERS, ...CHILD_LAYERS].forEach((layerId) => {
        const isHover = layerId.includes("hover");
        const isParent = PARENT_LAYERS.includes(layerId);
        isHover &&
          mapRef.setPaintProperty(
            layerId,
            "fill-opacity",
            getLayerFill(
              mapBbox ? captiveIds : undefined,
              isParent ? shatterIds.parents : undefined
            )
          );
      });

      if (!mapBbox && !previousMapBbox) {
        return;
      }

      CHILD_LAYERS.forEach((layerId) => {
        !layerId.includes("hover") &&
          mapRef.setPaintProperty(layerId, "line-opacity", 1);
      });

      const _bounds = (mapBbox || previousMapBbox)!;
      const tolerance = mapBbox
        ? BBOX_TOLERANCE_DEG * 2
        : BBOX_TOLERANCE_DEG * 5;
      const maxBounds = [
        [_bounds[0] - tolerance, _bounds[1] - tolerance],
        [_bounds[2] + tolerance, _bounds[3] + tolerance],
      ] as LngLatBoundsLike;

      if (mapBbox) {
        mapRef.fitBounds(maxBounds);
      }
    }
  );

  const lockFeaturesSub = useMapStore.subscribe(
    (state) => state.lockedFeatures,
    (lockedFeatures, previousLockedFeatures) => {
      console.log("LOCKING")
      const { getMapRef, shatterIds, mapDocument } = useMapStore.getState();
      const mapRef = getMapRef();
      if (!mapRef || !mapDocument) return;
      const getLayer = (id: string) => {
        const isChild = shatterIds.children.has(id);
        if (isChild && mapDocument.child_layer) {
          return mapDocument.child_layer;
        }
        return mapDocument.parent_layer;
      };

      lockedFeatures.forEach((id) => {
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
      
      previousLockedFeatures.forEach((id) => {
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

  return [
    addLayerSubMapDocument,
    _shatterMapSideEffectRender,
    _hoverMapSideEffectRender,
    _zoneAssignmentMapSideEffectRender,
  ];
};
