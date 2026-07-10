'use client';
import {throttle} from 'lodash';
import type {MapLayerMouseEvent, MapLayerTouchEvent, MapGeoJSONFeature} from 'maplibre-gl';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_POINTS_LAYER_ID,
  BLOCK_POINTS_LAYER_ID_CHILD,
} from '@constants/map/layerIds';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {setHoverFeatures} from '@/app/utils/map/hoverFeatures';
import {
  ALL_BRUSHING_TOOLS,
  AREA_SELECT_TOOLS,
  EMPTY_FEATURE_ARRAY,
  POINT_SELECT_TOOLS,
  TOOLTIP_TOOLS,
  mapEventHandlers,
} from '@/app/utils/events/mapEvents';

function getLayerIdsToPaint(
  child_layer: string | undefined | null,
  activeTool: ReturnType<typeof useMapControlsStore.getState>['activeTool'],
  childOnly: boolean
) {
  if (activeTool === ACTIVE_TOOLS.SHATTER) {
    return [BLOCK_HOVER_LAYER_ID];
  }

  if (child_layer && childOnly) {
    return [BLOCK_POINTS_LAYER_ID_CHILD, BLOCK_HOVER_LAYER_ID_CHILD];
  }

  return child_layer
    ? [
        BLOCK_POINTS_LAYER_ID,
        BLOCK_POINTS_LAYER_ID_CHILD,
        BLOCK_HOVER_LAYER_ID,
        BLOCK_HOVER_LAYER_ID_CHILD,
      ]
    : [BLOCK_POINTS_LAYER_ID, BLOCK_HOVER_LAYER_ID];
}

const handleCoiFeatureSelection = (
  selectedFeatures: MapGeoJSONFeature[] | undefined,
  mapRef: (MapLayerMouseEvent | MapLayerTouchEvent)['target'] | null
) => {
  const mapStore = useMapStore.getState();
  const {activeTool, selectedZone, setIsPainting} = useMapControlsStore.getState();
  const {mutateCommunityAssignments, ingestAccumulatedAssignments} =
    useCoiAssignmentsStore.getState();

  switch (activeTool) {
    case ACTIVE_TOOLS.SHATTER: {
      const documentId = mapStore.mapDocument?.document_id;
      if (documentId && selectedFeatures?.length) {
        mapStore.handleShatter(selectedFeatures || []);
      }
      return;
    }
    case ACTIVE_TOOLS.BRUSH:
    case ACTIVE_TOOLS.ERASER:
      if (!mapStore.communities.length) {
        setIsPainting(false);
        return;
      }
      // selectedZone can point at a community id that was just removed (the picker
      // doesn't auto-clear). Abort before mutating feature state so we don't write
      // stale keys into accumulatedAssignments that point at non-existent communities.
      if (!mapStore.communities.some(c => c.id === selectedZone)) {
        setIsPainting(false);
        return;
      }
      if (selectedFeatures && mapRef) {
        mutateCommunityAssignments(
          mapRef,
          selectedFeatures || [],
          selectedZone,
          activeTool === ACTIVE_TOOLS.BRUSH ? ACTIVE_TOOLS.BRUSH : ACTIVE_TOOLS.ERASER
        );
        setIsPainting(false);
        ingestAccumulatedAssignments();
      }
      return;
  }
};

export const handleCoiMapClick = throttle((e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapRef = e.target;
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();
  const {selectingLayerId, setPaintConstraint} = useOverlayStore.getState();
  const {activeTool, paintFunction, brushSize, mapOptions} = mapControls;
  let selectedFeatures: MapGeoJSONFeature[] | undefined = undefined;
  const childOnly = mapStore.captiveIds.size > 0 || mapOptions.mode === 'break';

  if (selectingLayerId) {
    const features = mapRef.queryRenderedFeatures(e.point, {
      layers: [`overlay-click-${selectingLayerId}`],
    });
    if (features.length > 0) {
      setPaintConstraint(selectingLayerId, features[0].id as string);
      setHoverFeatures(EMPTY_FEATURE_ARRAY);
    }
    return;
  }

  if (POINT_SELECT_TOOLS.includes(activeTool)) {
    selectedFeatures = paintFunction(mapRef, e, 0, [BLOCK_HOVER_LAYER_ID]);
  } else if (AREA_SELECT_TOOLS.includes(activeTool)) {
    const paintLayers = getLayerIdsToPaint(
      mapStore.mapDocument?.child_layer,
      activeTool,
      childOnly
    );
    selectedFeatures = paintFunction(mapRef, e, brushSize, paintLayers);
  }

  handleCoiFeatureSelection(selectedFeatures, mapRef);
}, 25);

export const handleCoiMapMouseMove = throttle((e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapRef = e.target;
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();

  const {mapOptions, activeTool, isPainting, paintFunction, brushSize} = mapControls;
  const {mapDocument} = mapStore;
  const {selectedZone} = mapControls;
  const {mutateCommunityAssignments} = useCoiAssignmentsStore.getState();
  const {selectingLayerId} = useOverlayStore.getState();
  const setTooltip = useTooltipStore.getState().setTooltip;
  const sourceLayer = mapDocument?.parent_layer;
  const childOnly = mapStore.captiveIds.size > 0 || mapOptions.mode === 'break';
  const paintLayers = getLayerIdsToPaint(mapStore.mapDocument?.child_layer, activeTool, childOnly);
  const hasCommunities = mapStore.communities.length > 0;

  const isBrushingTool = sourceLayer && ALL_BRUSHING_TOOLS.includes(activeTool);
  if (selectingLayerId) {
    const features = mapRef.queryRenderedFeatures(e.point, {
      layers: [`overlay-click-${selectingLayerId}`],
    });
    if (features.length > 0) {
      setHoverFeatures([features[0]]);
      setTooltip(null);
    }
    return;
  }
  if (!isBrushingTool) {
    setHoverFeatures(EMPTY_FEATURE_ARRAY);
    setTooltip(null);
    return;
  }

  const selectedFeatures = paintFunction(mapRef, e, brushSize, paintLayers);
  // Maplibre touch events carry `points`/`lngLats` (not `touches`) — the
  // TouchEvent lives on originalEvent.
  const isTouchEvent =
    'touches' in e.originalEvent || (e.originalEvent as any)?.sourceCapabilities?.firesTouchEvents;
  if (isBrushingTool && !isTouchEvent && !isPainting) {
    setHoverFeatures(selectedFeatures || []);
  }
  if (selectedFeatures && isBrushingTool && isPainting && hasCommunities) {
    mutateCommunityAssignments(
      mapRef,
      selectedFeatures,
      selectedZone,
      activeTool === ACTIVE_TOOLS.BRUSH ? ACTIVE_TOOLS.BRUSH : ACTIVE_TOOLS.ERASER
    );
  }

  if (
    isBrushingTool &&
    selectedFeatures?.length &&
    (mapOptions.showPopulationTooltip || TOOLTIP_TOOLS)
  ) {
    setTooltip({
      ...e.point,
      data: mapOptions.showPopulationTooltip
        ? [
            {
              label: 'Total Pop',
              value:
                selectedFeatures?.reduce(
                  (acc, curr) => acc + parseInt(curr.properties.total_pop_20),
                  0
                ) ?? 'N/A',
            },
          ]
        : [],
    });
  } else {
    setTooltip(null);
  }
}, 5);

export const coiMapEventHandlers = {
  ...mapEventHandlers,
  onClick: handleCoiMapClick,
  onMouseMove: handleCoiMapMouseMove,
  // Touch drags must run the COI mutation path, not the districts one the
  // base handlers would use.
  onTouchMove: handleCoiMapMouseMove,
} as const;
