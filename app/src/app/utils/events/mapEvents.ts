/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
'use client';
import type {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  MapSourceDataEvent,
} from 'maplibre-gl';
import type {
  MapEvent,
  MapRef as MapLibreMap,
  MapRef,
  ViewStateChangeEvent,
} from 'react-map-gl/maplibre';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_POINTS_LAYER_ID,
  BLOCK_POINTS_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
  INTERACTIVE_LAYERS,
} from '@/app/constants/layers';
import {ResetMapSelectState} from '@utils/events/handlers';
import GeometryWorker from '../GeometryWorker';
import {ActiveTool} from '@/app/constants/types';
import {throttle} from 'lodash';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {setHoverFeatures} from '../map/hoverFeatures';

export const AREA_SELECT_TOOLS = ['brush', 'eraser', 'inspector'];
export const POINT_SELECT_TOOLS = ['shatter'];
export const ALL_BRUSHING_TOOLS = [...AREA_SELECT_TOOLS, ...POINT_SELECT_TOOLS];
export const TOOLTIP_TOOLS = ['inspector'];

export const EMPTY_FEATURE_ARRAY: MapGeoJSONFeature[] = [];
/*
 MapEvent handling; these functions are called by the event listeners in the MapComponent
 */

/**
 * Get the layer IDs to paint based on whether we have
 * a shatterable map (based on whether a child layer is
 * present) and the active tool. If the active tool is
 * shatter, we only want to paint the shatterable layer.
 *
 * @param child_layer - string | undefined | null, the child layer
 * @param activeTool - ActiveTool, the active tool
 * @returns string[], the layer IDs to paint
 */
function getLayerIdsToPaint(child_layer: string | undefined | null, activeTool: ActiveTool) {
  if (activeTool === 'shatter') {
    return [BLOCK_HOVER_LAYER_ID];
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

export const handleFeatureSelection = (
  selectedFeatures: MapGeoJSONFeature[] | undefined,
  mapStore: MapStore,
  sourceLayer: string | undefined,
  mapRef: (MapLayerMouseEvent | MapLayerTouchEvent)['target'] | null
) => {
  const {activeTool, selectedZone, setIsPainting} = useMapControlsStore.getState();
  const {mutateZoneAssignments} = useAssignmentsStore.getState();
  switch (activeTool) {
    case 'shatter':
      const documentId = mapStore.mapDocument?.document_id;
      if (documentId && selectedFeatures?.length) {
        mapStore.handleShatter(selectedFeatures || []);
      }
      return;
    case 'brush':
    case 'eraser':
      if (sourceLayer && selectedFeatures && mapRef && mapStore) {
        // select on both the map object and the store
        mutateZoneAssignments(
          mapRef,
          selectedFeatures || [],
          activeTool === 'brush' ? selectedZone : null
        );
        setIsPainting(false);
      }
  }
};
/**
 * What happens when the map is clicked on; incomplete implementation
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param map - Map | null, the maplibre map instance
 */
export const handleMapClick = throttle((e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapRef = e.target;
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();
  const {selectingLayerId, setPaintConstraint} = useOverlayStore.getState();
  const {activeTool, paintFunction, brushSize} = mapControls;
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  let selectedFeatures: MapGeoJSONFeature[] | undefined = undefined;

  if (selectingLayerId) {
    const features = mapRef.queryRenderedFeatures(e.point, {
      layers: [`overlay-click-${selectingLayerId}`],
    });
    if (features.length > 0) {
      setPaintConstraint({
        overlayId: selectingLayerId,
        featureId: features[0].id as string,
        geometry: features[0].geometry as GeoJSON.Geometry,
      });
      setHoverFeatures(EMPTY_FEATURE_ARRAY);
    }
    return;
  }
  if (POINT_SELECT_TOOLS.includes(activeTool)) {
    selectedFeatures = paintFunction(mapRef, e, 0, [BLOCK_HOVER_LAYER_ID]);
  } else if (AREA_SELECT_TOOLS.includes(activeTool)) {
    const paintLayers = getLayerIdsToPaint(mapStore.mapDocument?.child_layer, activeTool);
    selectedFeatures = paintFunction(mapRef, e, brushSize, paintLayers);
  } else {
    // tbd, for pan mode - is there an info mode on click?
  }
  handleFeatureSelection(selectedFeatures, mapStore, sourceLayer, mapRef);
}, 25);

export const handleMapMouseUp = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();
  const activeTool = mapControls.activeTool;
  const isPainting = mapControls.isPainting;

  if ((activeTool === 'brush' || activeTool === 'eraser') && isPainting) {
    // set isPainting to false
    mapControls.setIsPainting(false);
  }
};

export const handleMapMouseDown = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapRef = e.target;
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();
  const activeTool = mapControls.activeTool;

  if (activeTool === 'pan') {
    // enable drag pan
    mapRef.dragPan.enable();
  } else if (activeTool === 'brush' || activeTool === 'eraser') {
    // disable drag pan
    mapRef.dragPan.disable();
    mapControls.setIsPainting(true);
  }
};

export const handleMapMouseEnter = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  // check if mouse is down
  // if so, set is painting true
  // @ts-ignore this is the correct behavior but event types are incorrect
  if (e.originalEvent?.buttons === 1) {
    useMapControlsStore.getState().setIsPainting(true);
  }
};

export const handleMapMouseOver = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {};

export const handleMapMouseLeave = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  setTimeout(() => {
    setHoverFeatures(EMPTY_FEATURE_ARRAY);
    useTooltipStore.getState().setTooltip(null);
  }, 125);
  useMapControlsStore.getState().setIsPainting(false);
};

export const handleMapMouseOut = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  setTimeout(() => {
    setHoverFeatures(EMPTY_FEATURE_ARRAY);
    useTooltipStore.getState().setTooltip(null);
  }, 250);
  useMapControlsStore.getState().setIsPainting(false);
};

export const handleMapMouseMove = throttle((e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapRef = e.target;
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();

  const {mapOptions, activeTool, isPainting, paintFunction, brushSize} = mapControls;
  const {mapDocument} = mapStore;
  const {selectedZone} = mapControls;
  const {mutateZoneAssignments} = useAssignmentsStore.getState();
  const {selectingLayerId} = useOverlayStore.getState();
  const setTooltip = useTooltipStore.getState().setTooltip;
  const sourceLayer = mapDocument?.parent_layer;
  const paintLayers = getLayerIdsToPaint(
    // Boolean(mapStore.mapDocument?.child_layer && mapStore.captiveIds.size),
    mapStore.mapDocument?.child_layer,
    activeTool
  );

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
  // sourceCapabilities exists on the UIEvent constructor, which does not appear
  // properly tpyed in the default map events
  // https://developer.mozilla.org/en-US/docs/Web/API/UIEvent/sourceCapabilities
  const isTouchEvent =
    'touches' in e || (e.originalEvent as any)?.sourceCapabilities?.firesTouchEvents;
  if (isBrushingTool && !isTouchEvent && !isPainting) {
    setHoverFeatures(selectedFeatures || []);
  }
  if (selectedFeatures && isBrushingTool && isPainting) {
    // selects in the map object; the store object
    // is updated in the mouseup event
    mutateZoneAssignments(mapRef, selectedFeatures, activeTool === 'brush' ? selectedZone : null);
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

export const handleMapZoom = (e: ViewStateChangeEvent) => {};

export const handleMapIdle = (e: MapEvent) => {
  const mapDocument = useMapStore.getState().mapDocument;
  const currentZoom = e.target.getZoom();
  if (GeometryWorker && mapDocument) {
    GeometryWorker.setMaxParentZoom(currentZoom);
  }
};

export const handleMapMoveEnd = () => {};

export const handleMapZoomEnd = (e: ViewStateChangeEvent) => {};

export const handleResetMapSelectState = (map: MapLibreMap | null) => {
  const mapStore = useMapStore.getState();
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  if (sourceLayer) {
    ResetMapSelectState(map, mapStore, sourceLayer);
  } else {
    console.error('No source layer selected');
  }
};

export const handleMapContextMenu = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const mapRef = e.target;
  const mapStore = useMapStore.getState();
  const mapControls = useMapControlsStore.getState();
  const activeTool = mapControls.activeTool;
  if (activeTool !== 'pan') {
    return;
  }
  e.preventDefault();
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  // Selects from the hover layers instead of the points
  // Otherwise, its hard to select precisely
  const paintLayers = mapStore.mapDocument?.child_layer
    ? INTERACTIVE_LAYERS
    : [BLOCK_HOVER_LAYER_ID];

  const selectedFeatures = mapControls.paintFunction(mapRef, e, 0, paintLayers, false);

  if (!selectedFeatures?.length || !mapRef || !sourceLayer) return;

  const handleClose = () => {
    mapStore.setContextMenu(null);
  };

  mapRef.once('movestart', handleClose);

  mapStore.setContextMenu({
    x: e.point.x,
    y: e.point.y,
    data: selectedFeatures[0],
    close: handleClose,
  });
};

export const throttledSetWorkerHash = throttle((hash: string) => {
  useMapStore.getState().setWorkerUpdateHash(hash);
}, 1000);

export const handleDataLoad = (e: MapSourceDataEvent) => {
  const {mapDocument, setMapRenderingState, setWorkerUpdateHash} = useMapStore.getState();
  const {setStateFp} = useMapControlsStore.getState();
  const {tiles_s3_path, parent_layer} = mapDocument || {};
  if (!tiles_s3_path || !parent_layer || !(e?.source as any)?.url?.includes(tiles_s3_path)) return;
  const tileData = e?.tile?.latestFeatureIndex;
  if (!tileData) return;
  if (!tileData.vtLayers) {
    tileData.loadVTLayers();
  }
  if (!mapDocument?.statefps) {
    const ft = e?.tile?.latestFeatureIndex?.vtLayers?.[parent_layer];
    const stateFipsSet = ft?.feature(0)?.properties?.path?.replace('vtd:', '')?.slice(0, 2);
    stateFipsSet && setStateFp(stateFipsSet);
  }
  setMapRenderingState('loaded');
  if (mapDocument) {
    GeometryWorker?.loadTileData({
      tileData: e.tile.latestRawTileData,
      tileID: e.tile.tileID.canonical,
      mapDocument,
      idProp: 'path',
    });
    throttledSetWorkerHash(new Date().toISOString());
  }
};

export const mapEventHandlers = {
  onClick: handleMapClick,
  onMouseUp: handleMapMouseUp,
  onMouseDown: handleMapMouseDown,
  onMouseEnter: handleMapMouseEnter,
  onMouseOver: handleMapMouseOver,
  onMouseLeave: handleMapMouseLeave,
  onMouseOut: handleMapMouseOut,
  onMouseMove: handleMapMouseMove,
  onZoom: handleMapZoom,
  onIdle: handleMapIdle,
  onMoveEnd: handleMapMoveEnd,
  onZoomEnd: handleMapZoomEnd,
  onContextMenu: handleMapContextMenu,
  onData: handleDataLoad,
} as const;

export const handleWheelOrPinch = (e: MouseEvent | TouchEvent, map: MapRef | null) => {
  if (!map) return;
  // Both trackpad pinchn and mousewheel scroll (or two finger scroll)
  // are 'wheel' events, except in safari which has gesture events
  // The ctrlKey property is how most browsers indicate a pinch event
  // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent#browser_compatibility
  const wheelRate = e.ctrlKey ? 100 : 450;
  const zoomRate = e.ctrlKey ? 50 : 100;
  // TODO: Safari on iOS does not use this standard and needs additional cases
  // If the experience feels bad on mobile
  // if (map.scrollZoom._wheelZoomRate === 1 / wheelRate) return;
  // map.scrollZoom.setWheelZoomRate(1 / wheelRate);
  // map.scrollZoom.setZoomRate(1 / zoomRate);
};
export const mapContainerEvents = [{action: 'wheel', handler: handleWheelOrPinch}];
