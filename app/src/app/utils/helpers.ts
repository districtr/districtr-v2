import {
  Map as MaplibreMap,
  Point,
  PointLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  LngLat,
  LngLatLike,
} from 'maplibre-gl';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {MapStore, useMapStore} from '../store/mapStore';
import {NullableZone} from '../constants/types';

/**
 * PaintEventHandler
 * A function that takes a map reference, a map event object, and a brush size.
 * @param map - Map | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 */
export type PaintEventHandler = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  layers?: string[],
  filterLocked?: boolean
) => MapGeoJSONFeature[] | undefined;

/**
 * ContextMenuState
 * Represents the state of the context menu.
 * @typedef {Object} ContextMenuState
 * @property {number} x - The x-coordinate of the context menu.
 * @property {number} y - The y-coordinate of the context menu.
 * @property {Object} data - The data associated with the context menu.
 * @property {string} data.geoid - The geographic ID.
 * @property {string} data.name - The name associated with the geographic ID.
 */
export type ContextMenuState = {
  x: number;
  y: number;
  data: MapGeoJSONFeature;
  close: () => void;
};

/**
 * boxAroundPoint
 * Create a bounding box around a point on the map.
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param radius - number, the radius of the bounding box
 * @returns [PointLike, PointLike] - An array of two points representing the bounding box
 */
export const boxAroundPoint = (
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  radius: number
): [PointLike, PointLike] => {
  return [
    [e.point.x - radius, e.point.y - radius],
    [e.point.x + radius, e.point.y + radius],
  ];
};

/**
 * getFeaturesInBbox
 * Get the features in a bounding box on the map.
 * @param map - Map | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature[] | undefined - An array of map features or undefined
 */
export const getFeaturesInBbox = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  _layers: string[] = [BLOCK_HOVER_LAYER_ID],
  filterLocked: boolean = true
): MapGeoJSONFeature[] | undefined => {
  const bbox = boxAroundPoint(e, brushSize);
  const {captiveIds, lockedFeatures, mapDocument, checkParentsToHeal, shatterIds, isPainting} =
    useMapStore.getState();

  const layers = _layers?.length
    ? _layers
    : captiveIds.size
      ? [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD]
      : [BLOCK_HOVER_LAYER_ID];

  let features = map?.queryRenderedFeatures(bbox, {layers}) || [];
  // If captiveIds exist (eg. block view mode) only select those IDs
  if (captiveIds.size) {
    features = features.filter(f => captiveIds.has(f.id?.toString() || ''));
  }
  // if filtering locked feature, remove those
  if (filterLocked && lockedFeatures.size) {
    features = features.filter(f => !lockedFeatures.has(f.id?.toString() || ''));
  }

  // if there is a child layer and parents have been shattered
  // check if any of the selected IDs are parents
  if (mapDocument?.child_layer && shatterIds.parents.size) {
    const parentIds: MapStore['parentsToHeal'] = [];
    features = features.filter(f => {
      const id = f.id?.toString();
      if (!id) return false;
      const isParent = shatterIds.parents.has(id);
      if (isParent) {
        // check if parent IDs have been painted solid
        parentIds.push(id);
        // don't paint parents with children
        return false;
      } else {
        // do paint everything else
        return true;
      }
    });
    parentIds.length && checkParentsToHeal(parentIds);
  }
  return features;
};

/**
 * getFeatureUnderCursor
 * Get the feature under the cursor on the map.
 * @param map - MaplibreMap | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature | undefined - A map feature or undefined
 */
export const getFeatureUnderCursor = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  layers: string[] = [BLOCK_HOVER_LAYER_ID]
): MapGeoJSONFeature[] | undefined => {
  return map?.queryRenderedFeatures(e.point, {layers});
};

/**
 * getFeaturesIntersectingCounties
 * Get the features intersecting counties on the map.
 * @param map - MaplibreMap | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @param brushSize - number, the size of the brush
 * @returns MapGeoJSONFeature[] | undefined - An array of map features or undefined
 */
export const getFeaturesIntersectingCounties = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent,
  brushSize: number,
  layers: string[] = [BLOCK_HOVER_LAYER_ID]
): MapGeoJSONFeature[] | undefined => {
  if (!map) return;

  const countyFeatures = map.queryRenderedFeatures(e.point, {
    layers: ['counties_fill'],
  });

  if (!countyFeatures?.length) return;
  const fips = countyFeatures[0].properties.STATEFP + countyFeatures[0].properties.COUNTYFP;

  const features = map.queryRenderedFeatures(undefined, {
    layers,
  });
  return features.filter(p => (p?.id) &&
    p.id.toString().match(/\d{5}/)?.[0] === fips);
};

/**
 * mousePos
 * Get the position of the mouse on the map.
 * @param map - MaplibreMap | null, the maplibre map instance
 * @param e - MapLayerMouseEvent | MapLayerTouchEvent, the event object
 * @returns Point - The position of the mouse on the map
 */
export const mousePos = (map: MaplibreMap | null, e: MapLayerMouseEvent | MapLayerTouchEvent) => {
  const canvas = map?.getCanvasContainer();
  if (!canvas) return new Point(0, 0);
  const rect = canvas.getBoundingClientRect();
  return new Point(
    e.point.x - rect.left - canvas.clientLeft,
    e.point.y - rect.top - canvas.clientTop
  );
};

export interface LayerVisibility {
  layerId: string;
  visibility: 'none' | 'visible';
}

/**
 * toggleLayerVisibility
 * This function is responsible for toggling the visibility of layers on the map.
 * It takes a map reference and an array of layer IDs to toggle.
 * Layers must already be added to the map and have the layout property "visibility"
 * set to "none" or "visible". If the layout property is not set, this functions assumes
 * the layer is not visible and will toggle visibility on.
 *
 * @param {MutableRefObject<maplibregl.Map>} mapRef - The map reference.
 * @param {string[]} layerIds - An array of layer IDs to toggle.
 * @returns {LayerVisibility[]} - An array of objects containing the layer ID and the new visibility state.
 */
export function toggleLayerVisibility(
  mapRef: maplibregl.Map,
  layerIds: string[]
): LayerVisibility[] {
  const activeLayerIds = getVisibleLayers(mapRef)?.map(layer => layer.id);
  if (!activeLayerIds) return [];

  return layerIds.map(layerId => {
    if (activeLayerIds && activeLayerIds.includes(layerId)) {
      mapRef.setLayoutProperty(layerId, 'visibility', 'none');
      return {layerId: layerId, visibility: 'none'};
    } else {
      mapRef.setLayoutProperty(layerId, 'visibility', 'visible');
      return {layerId: layerId, visibility: 'visible'};
    }
  }, {});
}

/**
 * getVisibleLayers
 * Returning an array of visible layers on the map based on the visibility layout property.
 * i.e. it's not based on what the user actually sees.
 * @param {maplibregl.Map} map - The map reference.
 */
export function getVisibleLayers(map: MaplibreMap | null) {
  return map?.getStyle().layers.filter(layer => {
    return layer.layout?.visibility === 'visible';
  });
}

export type ColorZoneAssignmentsState = [
  MapStore['zoneAssignments'],
  MapStore['mapDocument'],
  MapStore['getMapRef'],
  MapStore['shatterIds'],
  MapStore['appLoadingState'],
  MapStore['mapRenderingState'],
  MapStore['mapOptions']['lockPaintedAreas'],
];

export const getMap = (_getMapRef?: MapStore['getMapRef']) => {
  const mapRef = _getMapRef?.() || useMapStore.getState().getMapRef();
  if (mapRef?.getStyle().layers.findIndex(layer => layer.id === BLOCK_HOVER_LAYER_ID) !== -1) {
    return null;
  }

  return mapRef as maplibregl.Map;
};

/**
 * Assigns colors to zones on the map based on the current zone assignments.
 * This function updates the feature state of map features to reflect their assigned zones.
 *
 * @function
 * @name colorZoneAssignments
 * @returns {void}
 *
 * @requires useMapStore
 * @requires BLOCK_SOURCE_ID
 *
 * @description
 * This function does the following:
 * 1. Retrieves the current state from the map store.
 * 2. Checks if the map reference and map document are available.
 * 3. Iterates through the zone assignments.
 * 4. Determines whether each assignment is for a parent or child layer.
 * 5. Sets the feature state for each assigned feature on the map.
 */
export const colorZoneAssignments = (
  state: ColorZoneAssignmentsState,
  previousState?: ColorZoneAssignmentsState
) => {
  const [zoneAssignments, mapDocument, getMapRef, _, appLoadingState, mapRenderingState] = state;
  const previousZoneAssignments = previousState?.[0] || null;
  const mapRef = getMapRef();
  const {shatterIds} = useMapStore.getState();
  if (!mapRef || !mapDocument || appLoadingState !== 'loaded' || mapRenderingState !== 'loaded') {
    return;
  }
  const isInitialRender = previousState?.[4] !== 'loaded' || previousState?.[5] !== 'loaded';

  zoneAssignments.forEach((zone, id) => {
    const hasNoId = !id;
    const isRepeated =
      id && !isInitialRender && previousZoneAssignments?.get(id) === zoneAssignments.get(id);
    // const isLocked = lockedFeatures.size && lockedFeatures.has(id);
    if (hasNoId || isRepeated) {
      return;
    }

    const isChild = shatterIds.children.has(id);
    const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;

    if (!sourceLayer) {
      return;
    }

    mapRef?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id,
        sourceLayer,
      },
      {
        selected: true,
        zone,
      }
    );
  });
};

/**
 * resetZoneColors
 * Resets the zone colors for the specified feature IDs on the map.
 *
 * This function sets the feature state for each ID in the provided set or array to indicate that
 * the zone color should be reset. It checks if the map document is available and determines
 * the appropriate source layer based on the existence of child layers and shatter IDs.
 *
 * @param {Set<string> | string[]} ids - A set or array of feature IDs for which to reset the zone colors.
 * @param {ReturnType<MapStore['getMapRef']>} mapRef - The maplibre map instance used to set the feature state.
 * @param {MapStore['mapDocument']} mapDocument - The map document containing layer information.
 * @param {MapStore['shatterIds']} shatterIds - The shatter IDs used to determine layer types.
 */
export const resetZoneColors = ({
  ids,
  zoneAssignments,
  mapRef,
  mapDocument,
  shatterIds,
}: {
  ids?: Set<string> | string[];
  zoneAssignments?: MapStore['zoneAssignments'];
  mapRef: ReturnType<MapStore['getMapRef']>;
  mapDocument: MapStore['mapDocument'];
  shatterIds: MapStore['shatterIds'];
}) => {
  const idsToReset = ids
    ? Array.from(ids)
    : zoneAssignments
      ? Array.from(zoneAssignments.keys())
      : null;
  if (!mapDocument || !mapRef || !idsToReset) return;
  const childLayerExists = mapDocument?.child_layer;
  const shatterIdsExist = shatterIds.parents.size;
  const getSourceLayer =
    childLayerExists && shatterIdsExist
      ? (id: string) => {
          return shatterIds.children.has(id) ? mapDocument.child_layer! : mapDocument.parent_layer;
        }
      : (_: string) => mapDocument.parent_layer;
  idsToReset.forEach(id => {
    const sourceLayer = getSourceLayer(id);
    mapRef?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id,
        sourceLayer,
      },
      {
        selected: true,
        zone: null,
      }
    );
  });
};

// property changes on which to re-color assignments
export const colorZoneAssignmentTriggers = [
  'zoneAssignments',
  'mapDocument',
  'mapRef',
  'shatterIds',
] as Array<keyof MapStore>;

/**
 * Sets zone assignments for child elements based on their parent's assignment.
 *
 * @param {MapStore['zoneAssignments']} zoneAssignments - The current map of zone assignments.
 * @param {string} parent - The ID of the parent element.
 * @param {string[]} children - An array of child element IDs.
 *
 * @description
 * This function checks if the parent has a zone assignment. If it does:
 * 1. It assigns the parent's zone to all the children.
 * 2. It removes the parent's zone assignment.
 * This is typically used when "shattering" a parent element into its constituent parts.
 */
export const setZones = (
  zoneAssignments: MapStore['zoneAssignments'],
  parent: string,
  children: Set<string>
) => {
  const zone = zoneAssignments.get(parent);
  if (zone) {
    children.forEach(childId => {
      zoneAssignments.set(childId, zone);
    });
    zoneAssignments.delete(parent);
  }
};

export const shallowCompareArray = (curr: unknown[], prev: unknown[]) => {
  if (curr.length !== prev.length) {
    return false;
  }
  for (let i = 0; i < curr.length; i++) {
    if (curr[i] !== prev[i]) {
      return false;
    }
  }
  return true;
};

/**
 * checkIfSameZone
 * Checks if all provided IDs belong to the same zone based on the zone assignments.
 *
 * @param {Set<string> | string[]} idsToCheck - A set or array of IDs to check against the zone assignments.
 * @param {Map<string, NullableZone>} zoneAssignments - A map of zone assignments where the key is the ID and the value is the assigned zone.
 * @returns {{ shouldHeal: boolean, zone: NullableZone | undefined }} - An object containing:
 *   - shouldHeal: A boolean indicating whether all IDs belong to the same zone.
 *   - zone: The zone that all IDs belong to, or undefined if no zone is assigned.
 */
export const checkIfSameZone = (
  idsToCheck: Set<string> | string[],
  zoneAssignments: Map<string, NullableZone>
) => {
  let zone: NullableZone | undefined = undefined;
  let shouldHeal = true;

  idsToCheck.forEach(id => {
    const assigment = zoneAssignments.get(id);
    if (zone === undefined) {
      zone = assigment;
    }
    if (assigment !== null && assigment !== zone) {
      shouldHeal = false;
    }
  });
  return {
    shouldHeal,
    zone: zone || null,
  };
};
