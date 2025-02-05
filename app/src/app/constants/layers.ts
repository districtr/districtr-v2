import {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';
import {Map} from 'maplibre-gl';
import {getBlocksSource} from './sources';
import {DocumentObject} from '../utils/api/apiHandlers';
import {MapStore, useMapStore} from '../store/mapStore';
import {colorScheme} from './colors';
import {throttle} from 'lodash';
import GeometryWorker from '../utils/GeometryWorker';
import { featureCache } from '../utils/featureCache';


export const BLOCK_SOURCE_ID = 'blocks';
export const BLOCK_LAYER_ID = 'blocks';
export const BLOCK_LAYER_ID_HIGHLIGHT = BLOCK_LAYER_ID + '-highlight';
export const BLOCK_LAYER_ID_HIGHLIGHT_CHILD = BLOCK_LAYER_ID + '-highlight-child';
export const BLOCK_LAYER_ID_CHILD = 'blocks-child';
export const BLOCK_HOVER_LAYER_ID = `${BLOCK_LAYER_ID}-hover`;
export const BLOCK_HOVER_LAYER_ID_CHILD = `${BLOCK_LAYER_ID_CHILD}-hover`;

export const INTERACTIVE_LAYERS = [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD];
export const LINE_LAYERS = [BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD] as const;
export const ZONE_LABEL_LAYERS = ['ZONE_OUTLINE', 'ZONE_LABEL', 'ZONE_LABEL_BG'];
export const PARENT_LAYERS = [BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID];
export const COUNTY_LAYERS = ['counties_fill', 'counties_boundary','counties_labels']

export const CHILD_LAYERS = [
  BLOCK_LAYER_ID_CHILD,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
];

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

export const ZONE_LABEL_STYLE_DYNAMIC = colorScheme.reduce(
  (val, color, i) => {
    val.push(['==', ['get', 'zone'], i + 1], color); // 1-indexed per mapStore.ts
    return val;
  },
  ['case'] as any
);
ZONE_LABEL_STYLE_DYNAMIC.push('#cecece');

// cast the above as an ExpressionSpecification
// @ts-ignore
export const ZONE_LABEL_STYLE: ExpressionSpecification = ZONE_LABEL_STYLE_DYNAMIC;

const LAYER_LINE_WIDTHS = {
  [BLOCK_LAYER_ID]: 2,
  [BLOCK_LAYER_ID_CHILD]: 1,
};

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
    // is broken parent
    ['boolean', ['feature-state', 'broken'], false],
    0,
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
  layerId: string,
  highlightUnassigned?: boolean
): LineLayerSpecification {
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
        ['boolean', ['feature-state', 'highlighted'], false],
        '#e5ff00', // yellow color when highlighted
        // @ts-ignore right behavior, wrong types
        ['==', ['feature-state', 'zone'], null],
        '#FF0000', // optionally red color when zone is not assigned
        '#000000', // Default color
      ],
      'line-width': [
        'case',
        [
          'any',
          ['boolean', ['feature-state', 'focused'], false],
          ['boolean', ['feature-state', 'highlighted'], false],
          [
            'all',
            // @ts-ignore correct logic, wrong types
            ['==', ['feature-state', 'zone'], null],
            ['boolean', !!highlightUnassigned],
            ['!', ['boolean', ['feature-state', 'broken'], false]],
          ],
        ],
        3.5,
        0, // Default width if none of the conditions are met
      ],
    },
  };
}

export function getBlocksLayerSpecification(
  sourceLayer: string,
  layerId: (typeof LINE_LAYERS)[number]
): LayerSpecification {
  const lineWidth = LAYER_LINE_WIDTHS[layerId];

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
      'line-color': [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        6,
        '#aaa',
        9,
        '#777',
        14,
        '#333',
      ],
      'line-width': [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        6,
        lineWidth * 0.125,
        9,
        lineWidth * 0.35,
        14,
        lineWidth,
      ],
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
  fetch(`${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/tilesets/${mapDocument.parent_layer}_rects.json`)
    .then((response) => response.json())
    .then((data) => {
      // GeometryWorker?.loadRectFeatures(data);
      featureCache.addFeatures(
        data,
        BLOCK_SOURCE_ID,
        mapDocument.parent_layer
      );
    });
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
    map?.addLayer(
      getHighlightLayerSpecification(mapDocument.child_layer, BLOCK_LAYER_ID_HIGHLIGHT_CHILD),
      LABELS_BREAK_LAYER_ID
    );
  }
  map?.addLayer(getHighlightLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID_HIGHLIGHT));
  useMapStore.getState().setMapRenderingState('loaded');
};

export function removeBlockLayers(map: Map | null) {
  if (!map) {
    return;
  }
  useMapStore.getState().setMapRenderingState('loading');
  [
    BLOCK_LAYER_ID,
    BLOCK_LAYER_ID_HIGHLIGHT,
    BLOCK_HOVER_LAYER_ID,
    BLOCK_LAYER_ID_CHILD,
    BLOCK_HOVER_LAYER_ID_CHILD,
    BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
  ].forEach(layer => {
    map.getLayer(layer) && map.removeLayer(layer);
  });

  [BLOCK_SOURCE_ID].forEach(source => {
    map.getSource(source) && map.removeSource(source);
  });
}

const getDissolved = async () => {
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef || !GeometryWorker) return;
  const currentView = mapRef.getBounds();
  const { centroids, dissolved} = await GeometryWorker.getCentroidsFromView(
    currentView.getWest(),
    currentView.getSouth(),
    currentView.getEast(),
    currentView.getNorth()
  );
  return {centroids, dissolved};
};

const removeZoneMetaLayers = () => {
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef) return;
  ZONE_LABEL_LAYERS.forEach(id => {
    mapRef.getLayer(id) && mapRef.removeLayer(id);
  });
  ZONE_LABEL_LAYERS.forEach(id => {
    mapRef.getSource(id) && mapRef.removeSource(id);
  });
};

const addZoneMetaLayers = async ({
  centroids,
  dissolved,
}: {
  centroids?: GeoJSON.FeatureCollection;
  dissolved?: GeoJSON.FeatureCollection;
}) => {
  const geoms =
    centroids && dissolved
      ? {
          centroids,
          dissolved,
        }
      : await getDissolved();
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef || !geoms) return;
  const zoneLabelSource = mapRef.getSource('ZONE_LABEL');
  if (!zoneLabelSource) {
    mapRef.addSource('ZONE_LABEL', {
      type: 'geojson',
      data: geoms.centroids,
    });
    mapRef.addLayer({
      id: 'ZONE_LABEL_BG',
      type: 'circle',
      source: 'ZONE_LABEL',
      paint: {
        'circle-color': '#fff',
        'circle-radius': 15,
        'circle-opacity': 0.8,
        'circle-stroke-color': ZONE_LABEL_STYLE || '#000',
        'circle-stroke-width': 2,
      },

      filter: ['==', ['get', 'zone'], ['get', 'zone']],
    });
    mapRef.addLayer({
      id: 'ZONE_LABEL',
      type: 'symbol',
      source: 'ZONE_LABEL',
      layout: {
        'text-field': ['get', 'zone'],
        'text-font': ['Barlow Bold'],
        'text-size': 18,
        'text-anchor': 'center',
        'text-offset': [0, 0],
      },
      paint: {
        'text-color': '#000',
      },
    });
  } else {
    // @ts-ignore behavior is correct, typing on `source` is wrong
    zoneLabelSource.setData(geoms.centroids);
  }
};

const debouncedAddZoneMetaLayers = throttle(
  addZoneMetaLayers,
  1000,
  { leading: true, trailing: true }
);

export {
  addBlockLayers,
  removeZoneMetaLayers,
  addZoneMetaLayers,
  getDissolved,
  debouncedAddZoneMetaLayers,
};
