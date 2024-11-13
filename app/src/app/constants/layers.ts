import {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
} from 'maplibre-gl';
import {Map} from 'maplibre-gl';
import {getBlocksSource} from './sources';
import {DocumentObject} from '../utils/api/apiHandlers';
import {MapStore, useMapStore} from '../store/mapStore';
import {colorScheme} from './colors';

export const BLOCK_SOURCE_ID = 'blocks';
export const BLOCK_LAYER_ID = 'blocks';
export const BLOCK_LAYER_ID_HIGHLIGHT = BLOCK_LAYER_ID + '-highlight';
export const BLOCK_LAYER_ID_CHILD = 'blocks-child';
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
export const BLOCK_HOVER_LAYER_ID_CHILD = `${BLOCK_LAYER_ID_CHILD}-hover`;

export const INTERACTIVE_LAYERS = [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD];
export const LINE_LAYERS = [BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD] as const

export const PARENT_LAYERS = [BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID]; 
export const CHILD_LAYERS = [BLOCK_LAYER_ID_CHILD, BLOCK_HOVER_LAYER_ID_CHILD];
export const DEFAULT_PAINT_STYLE: ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  '#FF0000',
  '#000000',
];

export const COUNTY_LAYER_IDS: string[] = ['counties_boundary', 'counties_labels'];

export const LABELS_BREAK_LAYER_ID = 'places_subplace';

const colorStyleBaseline: any[] = ['case'];

export const ZONE_ASSIGNMENT_STYLE_DYNAMIC = colorScheme.reduce((val, color, i) => {
  val.push(['==', ['feature-state', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
  return val;
}, colorStyleBaseline);
ZONE_ASSIGNMENT_STYLE_DYNAMIC.push('#cecece');

// cast the above as an ExpressionSpecification
// @ts-ignore
export const ZONE_ASSIGNMENT_STYLE: ExpressionSpecification = ZONE_ASSIGNMENT_STYLE_DYNAMIC;

const LAYER_LINE_WIDTHS = {
  [BLOCK_LAYER_ID]: 2,
  [BLOCK_LAYER_ID_CHILD]: 1
}

export function getLayerFilter(layerId: string, _shatterIds?: MapStore['shatterIds']) {
  const shatterIds = _shatterIds || useMapStore.getState().shatterIds;
  const isChildLayer = CHILD_LAYERS.includes(layerId);
  const ids = isChildLayer ? shatterIds.children : shatterIds.parents;
  const cleanIds = Boolean(ids) ? Array.from(ids) : [];
  const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];

  if (isChildLayer) {
    return filterBase;
  }
  const parentFilter: FilterSpecification = ['!', filterBase];
  return parentFilter;
}

export function getLayerFill(
  captiveIds?: Set<string>,
  shatterIds?: Set<string>
): DataDrivenPropertyValueSpecification<number> {
  const innerFillSpec = [
    'case',
    // geography is locked
    ['boolean', ['feature-state', 'locked'], false],
    0.35,
    // zone is selected and hover is true and hover is not null
    [
      'all',
      // @ts-ignore
      ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
      [
        'all',
        // @ts-ignore
        ['!', ['==', ['feature-state', 'hover'], null]], //< desired behavior but typerror
        ['boolean', ['feature-state', 'hover'], true],
      ],
    ],
    0.9,
    // zone is selected and hover is false, and hover is not null
    [
      'all',
      // @ts-ignore
      ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
      [
        'all',
        // @ts-ignore
        ['!', ['==', ['feature-state', 'hover'], null]], //< desired behavior but typerror
        ['boolean', ['feature-state', 'hover'], false],
      ],
    ],
    0.7,
    // zone is selected, fallback, regardless of hover state
    // @ts-ignore
    ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
    0.7,
    // hover is true, fallback, regardless of zone state
    ['boolean', ['feature-state', 'hover'], false],
    0.6,
    0.2,
  ] as unknown as DataDrivenPropertyValueSpecification<number>;
  if (captiveIds?.size) {
    return [
      'case',
      ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]],
      0.35,
      innerFillSpec,
    ] as DataDrivenPropertyValueSpecification<number>;
  } else if (shatterIds?.size) {
    return [
      'case',
      ['in', ['get', 'path'], ['literal', Array.from(shatterIds)]],
      0,
      innerFillSpec,
    ] as DataDrivenPropertyValueSpecification<number>;
  } else {
    return innerFillSpec;
  }
}
export function getHighlightLayerSpecification(
  sourceLayer: string,
  layerId: string
): LayerSpecification {
  return {
    id: layerId,
    source: BLOCK_SOURCE_ID,
    'source-layer': sourceLayer,
    type: 'line',
    layout: {
      visibility: 'visible',
      'line-cap': 'round',
    },
    paint: {
      'line-opacity': 1,
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'focused'], false],
        '#000000', // Black color when focused
        ['boolean', ['feature-state', 'highlighted'], false],
        '#e5ff00', // yellow color when highlighted
        '#000000', // Default color
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'focused'], false],
        5, // Width of 5 when focused
        ['boolean', ['feature-state', 'highlighted'], false],
        5, // Width of 5 when highlighted
        0, // Default width
      ],
    },
  };
}


export function getBlocksLayerSpecification(
  sourceLayer: string,
  layerId: typeof LINE_LAYERS[number]
): LayerSpecification {
  const lineWidth = LAYER_LINE_WIDTHS[layerId]

  const layerSpec: LayerSpecification = {
    id: layerId,
    source: BLOCK_SOURCE_ID,
    'source-layer': sourceLayer,
    type: 'line',
    layout: {
      visibility: 'visible',
    },
    paint: {
      'line-opacity': 0.8,
      // 'line-color': '#aaaaaa', // Default color
      'line-color': ['interpolate', ['exponential', 1.6], ['zoom'], 6, '#aaa', 9, '#777', 14, '#333'],
      'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, lineWidth*.125, 9, lineWidth*.35, 14, lineWidth],
    },
  };
  if (CHILD_LAYERS.includes(layerId)) {
    layerSpec.filter = getLayerFilter(layerId);
  }

  return layerSpec;
}

export function getBlocksHoverLayerSpecification(
  sourceLayer: string,
  layerId: string
): LayerSpecification {
  const layerSpec: LayerSpecification = {
    id: layerId,
    source: BLOCK_SOURCE_ID,
    'source-layer': sourceLayer,
    type: 'fill',
    layout: {
      visibility: 'visible',
    },
    paint: {
      'fill-opacity': getLayerFill(),
      'fill-color': ZONE_ASSIGNMENT_STYLE || '#000000',
    },
  };
  if (CHILD_LAYERS.includes(layerId)) {
    layerSpec.filter = getLayerFilter(layerId);
  }
  return layerSpec;
}

const addBlockLayers = (map: Map | null, mapDocument: DocumentObject) => {
  if (!map || !mapDocument.tiles_s3_path) {
    console.log('map or mapDocument not ready', mapDocument);
    return;
  }
  const blockSource = getBlocksSource(mapDocument.tiles_s3_path);
  removeBlockLayers(map);
  map?.addSource(BLOCK_SOURCE_ID, blockSource);
  map?.addLayer(
    getBlocksLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID),
    LABELS_BREAK_LAYER_ID
  );
  map?.addLayer(
    getBlocksHoverLayerSpecification(mapDocument.parent_layer, BLOCK_HOVER_LAYER_ID),
    LABELS_BREAK_LAYER_ID
  );
  if (mapDocument.child_layer) {
    map?.addLayer(
      getBlocksLayerSpecification(mapDocument.child_layer, BLOCK_LAYER_ID_CHILD),
      LABELS_BREAK_LAYER_ID
    );
    map?.addLayer(
      getBlocksHoverLayerSpecification(mapDocument.child_layer, BLOCK_HOVER_LAYER_ID_CHILD),
      LABELS_BREAK_LAYER_ID
    );
  }
  map?.addLayer(getHighlightLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID_HIGHLIGHT));
  useMapStore.getState().setMapRenderingState('loaded');

  // update map bounds based on document extent
  useMapStore.getState().setMapOptions({
    bounds: mapDocument.extent as [number, number, number, number],
    container: useMapStore.getState().mapOptions.container,
  });
};

export function removeBlockLayers(map: Map | null) {
  if (!map) {
    return;
  }
  useMapStore.getState().setMapRenderingState('loading');
  if (map.getLayer(BLOCK_LAYER_ID)) {
    map.removeLayer(BLOCK_LAYER_ID);
  }
  if (map.getLayer(BLOCK_LAYER_ID_HIGHLIGHT)) {
    map.removeLayer(BLOCK_LAYER_ID_HIGHLIGHT);
  }
  if (map.getLayer(BLOCK_HOVER_LAYER_ID)) {
    map.removeLayer(BLOCK_HOVER_LAYER_ID);
  }
  if (map.getLayer(BLOCK_LAYER_ID_CHILD)) {
    map.removeLayer(BLOCK_LAYER_ID_CHILD);
  }
  if (map.getLayer(BLOCK_HOVER_LAYER_ID_CHILD)) {
    map.removeLayer(BLOCK_HOVER_LAYER_ID_CHILD);
  }
  if (map.getSource(BLOCK_SOURCE_ID)) {
    map.removeSource(BLOCK_SOURCE_ID);
  }
}

export {addBlockLayers};
