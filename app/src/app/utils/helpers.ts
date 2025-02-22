import {
  Map as MaplibreMap,
  Point,
  PointLike,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
} from 'maplibre-gl';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {MapStore, useMapStore} from '../store/mapStore';
import {NullableZone} from '../constants/types';
import {idCache} from '../store/idCache';
import {ChartStore, useChartStore} from '@/app/store/chartStore';
import {calculateMinMaxRange} from './zone-helpers';

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

export type TooltipState = {
  x: number;
  y: number;
  data: Array<{label: string; value: unknown}>;
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
  const {captiveIds} = useMapStore.getState();

  const layers = _layers?.length
    ? _layers
    : captiveIds.size
      ? [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD]
      : [BLOCK_HOVER_LAYER_ID];

  let features = map?.queryRenderedFeatures(bbox, {layers}) || [];

  return filterFeatures(features, filterLocked);
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
  return filterFeatures(map?.queryRenderedFeatures(e.point, {layers}) || [], true);
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
  const {mapDocument, shatterIds} = useMapStore.getState();
  const filterPrefix = mapDocument?.parent_layer.includes('vtd') ? 'vtd:' : '';
  const cachedParentFeatures = idCache
    .getFiltered(`${filterPrefix}${fips}`)
    .map(([id, properties]) => ({
      source: BLOCK_SOURCE_ID,
      sourceLayer: mapDocument?.parent_layer,
      id,
      ...properties,
    }));

  const childFeatures = shatterIds.children.size
    ? (Array.from(shatterIds.children).map(id => ({
        id,
        source: BLOCK_SOURCE_ID,
        sourceLayer: mapDocument?.child_layer,
        properties: {
          path: id,
        },
      })) as any)
    : [];

  return filterFeatures([...cachedParentFeatures, ...childFeatures], true, [
    feature => Boolean(feature?.id && feature.id.toString().match(/\d{5}/)?.[0] === fips),
  ]);
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
  MapStore['mapOptions']['showZoneNumbers'],
];

export const getMap = (_getMapRef?: MapStore['getMapRef']) => {
  const mapRef = _getMapRef?.() || useMapStore.getState().getMapRef();
  if (
    mapRef?.getStyle().layers.findIndex((layer: any) => layer.id === BLOCK_HOVER_LAYER_ID) !== -1
  ) {
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
  const [
    zoneAssignments,
    mapDocument,
    getMapRef,
    currentShatterIds,
    appLoadingState,
    mapRenderingState,
  ] = state;
  const [previousZoneAssignments, prevShatterIds] = [
    previousState?.[0] || new Map(),
    previousState?.[3] || null,
  ];
  const mapRef = getMapRef();
  const isTemporal = useMapStore.getState().isTemporalAction;

  if (
    !mapRef || // map does not exist
    !mapDocument || // map document is not loaded
    (appLoadingState !== 'loaded' && !isTemporal) || // app was blurred, loading, or temporal state was mutatated
    mapRenderingState !== 'loaded' // map layers are not loaded
  ) {
    return;
  }
  const featureStateCache = mapRef.style.sourceCaches?.[BLOCK_SOURCE_ID]._state.state;
  if (!featureStateCache) return;
  const isInitialRender = previousState?.[4] !== 'loaded' || previousState?.[5] !== 'loaded';

  zoneAssignments.forEach((zone, id) => {
    if (!id) return;
    const isChild = currentShatterIds.children.has(id);
    const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
    if (!sourceLayer) return;
    const featureState = featureStateCache?.[sourceLayer]?.[id];
    if (!isInitialRender && featureState?.zone === zone) return;

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

  previousZoneAssignments.forEach((zone, id) => {
    if (zoneAssignments.get(id)) return;
    const isChild = prevShatterIds?.children.has(id);
    const sourceLayer = isChild ? mapDocument.child_layer : mapDocument.parent_layer;
    if (!sourceLayer) return;
    mapRef?.setFeatureState(
      {
        source: BLOCK_SOURCE_ID,
        id,
        sourceLayer,
      },
      {
        selected: false,
        zone: null,
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
  const zone = zoneAssignments.get(parent) || null;
  children.forEach(childId => {
    zoneAssignments.set(childId, zone);
  });
  zoneAssignments.delete(parent);
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
    if (assigment !== undefined && assigment !== zone) {
      shouldHeal = false;
    }
  });
  return {
    shouldHeal,
    zone: zone || null,
  };
};

/**
 * filterFeatures
 * Filters the provided features based on certain criteria, such as locked features and captive IDs.
 *
 * @param {MapGeoJSONFeature[]} features - An array of features to be filtered.
 * @param {boolean} [filterLocked=true] - A flag indicating whether to filter out locked features.
 * @returns {MapGeoJSONFeature[]} - An array of filtered features.
 *
 * @description
 * This function applies multiple filtering criteria to the input features:
 * 1. If captive IDs are present in the state, filters out features that are in the captive IDs set.
 * 2. Optionally filters out features that are in the locked features set.
 * 3. If the map document has a child layer and there are parent shatter IDs, it will:
 *    - Exclude parent features from the results.
 *    - Track parent IDs that need to be healed.
 *
 * The function returns an array of features that pass all the filtering criteria.
 */
const filterFeatures = (
  features: MapGeoJSONFeature[],
  filterLocked: boolean = true,
  additionalFilters: Array<(f: MapGeoJSONFeature) => boolean> = []
) => {
  const {
    activeTool,
    captiveIds,
    lockedFeatures,
    mapDocument,
    mapOptions,
    checkParentsToHeal,
    selectedZone,
    shatterIds,
    zoneAssignments,
  } = useMapStore.getState();
  const parentIdsToHeal: MapStore['parentsToHeal'] = [];
  const filterFunctions: Array<(f: MapGeoJSONFeature) => boolean> = [...additionalFilters];
  if (captiveIds.size) {
    filterFunctions.push(f => captiveIds.has(f.id?.toString() || ''));
  }
  if (filterLocked) {
    if (activeTool === 'brush' && mapOptions.lockPaintedAreas.includes(selectedZone)) {
      return [];
    } else if (mapOptions.lockPaintedAreas.length) {
      const lockedAreas = mapOptions.lockPaintedAreas;
      filterFunctions.push(
        f =>
          !lockedFeatures.has(f.id?.toString() || '') &&
          !lockedAreas.includes(zoneAssignments.get(f.id?.toString() || '') || null)
      );
    } else if (lockedFeatures.size) {
      filterFunctions.push(f => !lockedFeatures.has(f.id?.toString() || ''));
    }
  }
  if (mapDocument?.child_layer && shatterIds.parents.size) {
    filterFunctions.push(f => {
      const id = f.id?.toString();
      if (!id) return false;
      const isParent = shatterIds.parents.has(id);
      if (isParent) {
        // check if parent IDs have been painted solid
        parentIdsToHeal.push(id);
        // don't paint parents with children
        return false;
      } else {
        // do paint everything else
        return true;
      }
    });
  }

  if (!filterFeatures.length) return features;

  const filteredFeatures = features.filter(feature => {
    return filterFunctions.every(f => f(feature));
  });
  parentIdsToHeal.length && checkParentsToHeal(parentIdsToHeal);
  return filteredFeatures;
};

export const updateChartData = (
  mapMetrics: ChartStore['mapMetrics'],
  numDistricts: number | undefined,
  totPop: number | undefined
) => {
  let unassigned = structuredClone(totPop)!;
  if (totPop && numDistricts && mapMetrics && mapMetrics.data && numDistricts && totPop) {
    const populations: Record<string, number> = {};

    new Array(numDistricts).fill(null).forEach((_, i) => {
      const zone = i + 1;
      populations[zone] = mapMetrics.data.find(f => f.zone === zone)?.total_pop ?? 0;
    });
    const chartData = Object.entries(populations).map(([zone, total_pop]) => {
      unassigned -= total_pop;
      return {zone: +zone, total_pop};
    });

    const allAreNonZero = chartData.every(entry => entry.total_pop > 0);
    const stats = allAreNonZero ? calculateMinMaxRange(chartData) : undefined;

    useChartStore.getState().setChartInfo({
      stats,
      chartData,
      unassigned,
      totPop,
    });
  } else {
    useChartStore.getState().setChartInfo({
      stats: undefined,
      chartData: [],
      unassigned: null,
      totPop: 0,
    });
  }
};
