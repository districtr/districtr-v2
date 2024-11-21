/**
 Port over from map events declared at: https://github.com/uchicago-dsi/districtr-components/blob/2e8f9e5657b9f0fd2419b6f3258efd74ae310f32/src/Districtr/Districtr.tsx#L230
 */
'use client';
import type {Map as MapLibreMap, MapLayerMouseEvent, MapLayerTouchEvent} from 'maplibre-gl';
import {useMapStore} from '@/app/store/mapStore';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  debouncedAddZoneMetaLayers,
  INTERACTIVE_LAYERS,
} from '@/app/constants/layers';
import {ResetMapSelectState} from '@utils/events/handlers';
import {ActiveTool} from '@/app/constants/types';

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

  return child_layer ? [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD] : [BLOCK_HOVER_LAYER_ID];
}

/**
 * What happens when the map is clicked on; incomplete implementation
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param map - Map | null, the maplibre map instance
 */
export const handleMapClick = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const mapStore = useMapStore.getState();
  const {activeTool, handleShatter, lockedFeatures, lockFeature, selectMapFeatures} = mapStore;
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  if (activeTool === 'brush' || activeTool === 'eraser') {
    const paintLayers = getLayerIdsToPaint(mapStore.mapDocument?.child_layer, activeTool);
    const selectedFeatures = mapStore.paintFunction(map, e, mapStore.brushSize, paintLayers);

    if (sourceLayer && selectedFeatures && map && mapStore) {
      // select on both the map object and the store
      // @ts-ignore TODO fix typing on this function
      selectMapFeatures(selectedFeatures);
    }
  } else if (activeTool === 'shatter') {
    const documentId = mapStore.mapDocument?.document_id;
    if (documentId && e.features?.length) {
      handleShatter(
        documentId,
        e.features.filter(f => f.layer.id === BLOCK_HOVER_LAYER_ID)
      );
    }
  } else if (activeTool === 'lock') {
    const documentId = mapStore.mapDocument?.document_id;
    if (documentId && e.features?.length) {
      const feature = e.features[0];
      const id = feature.id?.toString() || '';
      lockFeature(id, !lockedFeatures.has(id));
    }
  } else {
    // tbd, for pan mode - is there an info mode on click?
  }
};

export const handleMapMouseUp = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;
  const isPainting = mapStore.isPainting;

  if ((activeTool === 'brush' || activeTool === 'eraser') && isPainting) {
    // set isPainting to false
    mapStore.setIsPainting(false);
  }
};

export const handleMapMouseDown = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const mapStore = useMapStore.getState();
  const activeTool = mapStore.activeTool;

  if (activeTool === 'pan') {
    // enable drag pan
    map?.dragPan.enable();
  } else if (activeTool === 'brush' || activeTool === 'eraser') {
    // disable drag pan
    map?.dragPan.disable();
    mapStore.setIsPainting(true);
  }
};

export const handleMapMouseEnter = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  // check if mouse is down
  // if so, set is painting true
  // @ts-ignore this is the correct behavior but event types are incorrect
  if (e.originalEvent?.buttons === 1){
    useMapStore.getState().setIsPainting(true)
  }
};

export const handleMapMouseOver = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {};

export const handleMapMouseLeave = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const {setHoverFeatures, setIsPainting} = useMapStore.getState();
  setHoverFeatures([]);
  setIsPainting(false)
};

export const handleMapMouseOut = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const {setHoverFeatures, setIsPainting} = useMapStore.getState();
  setHoverFeatures([]);
  setIsPainting(false)
};

export const handleMapMouseMove = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const mapStore = useMapStore.getState();
  const {activeTool, setHoverFeatures, isPainting, mapDocument, selectMapFeatures} = mapStore;
  const sourceLayer = mapDocument?.parent_layer;
  const paintLayers = getLayerIdsToPaint(
    // Boolean(mapStore.mapDocument?.child_layer && mapStore.captiveIds.size),
    mapStore.mapDocument?.child_layer,
    activeTool
  );

  const selectedFeatures = mapStore.paintFunction(map, e, mapStore.brushSize, paintLayers);
  const isBrushingTool = sourceLayer && ['brush', 'eraser', 'shatter', 'lock'].includes(activeTool);
  // sourceCapabilities exists on the UIEvent constructor, which does not appear
  // properly tpyed in the default map events
  // https://developer.mozilla.org/en-US/docs/Web/API/UIEvent/sourceCapabilities
  const isTouchEvent =
    'touches' in e || (e.originalEvent as any)?.sourceCapabilities?.firesTouchEvents;
  if (isBrushingTool && !isTouchEvent) {
    setHoverFeatures(selectedFeatures);
  }

  if (selectedFeatures && isBrushingTool && isPainting) {
    // selects in the map object; the store object
    // is updated in the mouseup event
    selectMapFeatures(selectedFeatures);
  }
};

export const handleMapZoom = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {};

export const handleMapIdle = () => {};

export const handleMapMoveEnd = () => {
  const { mapOptions } = useMapStore.getState()
  if (mapOptions.showZoneNumbers) {
    debouncedAddZoneMetaLayers.cancel()
    debouncedAddZoneMetaLayers({})
  }
};

export const handleMapZoomEnd = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {};

export const handleResetMapSelectState = (map: MapLibreMap | null) => {
  const mapStore = useMapStore.getState();
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  if (sourceLayer) {
    ResetMapSelectState(map, mapStore, sourceLayer);
  } else {
    console.error('No source layer selected');
  }
};

export const handleMapContextMenu = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  map: MapLibreMap | null
) => {
  const mapStore = useMapStore.getState();
  if (mapStore.activeTool !== 'pan') {
    return;
  }
  e.preventDefault();
  const setHoverFeatures = mapStore.setHoverFeatures;
  const sourceLayer = mapStore.mapDocument?.parent_layer;
  // Selects from the hover layers instead of the points
  // Otherwise, its hard to select precisely
  const paintLayers = mapStore.mapDocument?.child_layer
    ? INTERACTIVE_LAYERS
    : [BLOCK_HOVER_LAYER_ID];

  const selectedFeatures = mapStore.paintFunction(map, e, 0, paintLayers, false);

  if (!selectedFeatures?.length || !map || !sourceLayer) return;

  setHoverFeatures(selectedFeatures.slice(0, 1));

  const handleClose = () => {
    mapStore.setContextMenu(null);
    setHoverFeatures([]);
  };

  map.once('movestart', handleClose);

  mapStore.setContextMenu({
    x: e.point.x,
    y: e.point.y,
    data: selectedFeatures[0],
    close: handleClose,
  });
};

export const mapEvents = [
  {action: 'click', handler: handleMapClick},
  {action: 'mouseup', handler: handleMapMouseUp},
  {action: 'mousedown', handler: handleMapMouseDown},
  {action: 'touchstart', handler: handleMapMouseDown},
  {action: 'mouseenter', handler: handleMapMouseEnter},
  {action: 'mouseover', handler: handleMapMouseOver},
  {action: 'mouseleave', handler: handleMapMouseLeave},
  {action: 'touchleave', handler: handleMapMouseLeave},
  {action: 'mouseout', handler: handleMapMouseOut},
  {action: 'mousemove', handler: handleMapMouseMove},
  {action: 'touchmove', handler: handleMapMouseMove},
  {action: 'touchend', handler: handleMapMouseUp},
  {action: 'touchcancel', handler: handleMapMouseUp},
  {action: 'zoom', handler: handleMapZoom},
  {action: 'idle', handler: handleMapIdle},
  {action: 'moveend', handler: handleMapMoveEnd},
  {action: 'zoomend', handler: handleMapZoomEnd},
  {action: 'contextmenu', handler: handleMapContextMenu},
];
