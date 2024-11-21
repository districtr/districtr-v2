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
import {dissolve} from '@turf/dissolve';
import {centerOfMass} from '@turf/center-of-mass';
import {area} from '@turf/area'
import { debounce } from 'lodash';
import { NullableZone } from './types';

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

const getDissolved = () => {
  const {getMapRef, zoneAssignments} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef) return;
  const features = mapRef.queryRenderedFeatures(undefined, {layers: [BLOCK_HOVER_LAYER_ID]});
  let mappedFeatures: GeoJSON.Feature[] = [];
  features.forEach(f => {
    if (!f.id) return;
    const zone = zoneAssignments.get(f.id.toString());
    if (!zone) return;
    if (f.geometry?.type !== 'Polygon') return;
    mappedFeatures.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        ...f.properties,
        zone: +zone,
      },
    });
  });
  let dissolved: GeoJSON.FeatureCollection = dissolve(
    {
      type: 'FeatureCollection',
      features: mappedFeatures as any,
    },
    {
      propertyName: 'zone',
    }
  );
  let largestDissolvedFeatures: Record<number, {feature: GeoJSON.Feature, area: number}> = {}

  dissolved.features.forEach(feature => {
    const zone = feature.properties?.zone
    if (!zone) return
    const featureArea = area(feature)
    if (!largestDissolvedFeatures[zone] || featureArea > largestDissolvedFeatures[zone].area){
      largestDissolvedFeatures[zone] = {
        area: featureArea,
        feature
      }
    }
  })
  const cleanDissolvedFeautres = Object.values(largestDissolvedFeatures).map(f => f.feature)
  // dissolved.features = dissolved.features.map(f => ({
  //   ...f,
  //   properties: {
  //     zone: parseInt(f.properties?.zone)
  //   }
  // }))

  const centroids: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: cleanDissolvedFeautres.map(f => ({
      type: 'Feature',
      properties: {
        zone: +f.properties?.zone,
      },
      geometry: centerOfMass(f).geometry,
    })),
  };

  return {
    centroids,
    dissolved: cleanDissolvedFeautres
  };
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

const addZoneMetaLayers = ({
  centroids,
  dissolved,
}: {
  centroids?: GeoJSON.FeatureCollection;
  dissolved?: GeoJSON.FeatureCollection;
}) => {
  const t0 = performance.now()
  const geoms = centroids && dissolved ? {
    centroids, dissolved
  } : getDissolved()
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef || !geoms) return;
  removeZoneMetaLayers()
  ZONE_LABEL_LAYERS.forEach(id => {
    mapRef.getLayer(id) && mapRef.removeLayer(id);
    mapRef.getSource(id) && mapRef.removeSource(id);
  });
  // add map source of centroids
  mapRef.addSource('ZONE_LABEL', {
    type: 'geojson',
    data: geoms.centroids,
  });
  // mapRef.addSource('ZONE_OUTLINE', {
  //   type: 'geojson',
  //   data: geoms.dissolved,
  // });

  // mapRef.addLayer({
  //   id: 'ZONE_OUTLINE',
  //   type: 'line',
  //   source: 'ZONE_OUTLINE',
  //   paint: {
  //     'line-color': ZONE_LABEL_STYLE || '#000',
  //     'line-width': 3,
  //   },
  //   filter: ['==', ['get', 'zone'], ['get', 'zone']],
  // });

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
      'text-color': ZONE_LABEL_STYLE || '#000',
    },
  });
  console.log("!!!ADDED NUMERIC LAYERS IN", performance.now() - t0)
};

const debouncedAddZoneMetaLayers = debounce(addZoneMetaLayers, 250)



export {addBlockLayers, removeZoneMetaLayers, addZoneMetaLayers, getDissolved, debouncedAddZoneMetaLayers};
