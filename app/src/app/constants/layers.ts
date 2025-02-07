import {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
} from 'maplibre-gl';
import {useMapStore} from '../store/mapStore';
import {colorScheme} from './colors';
import {throttle} from 'lodash';
import GeometryWorker from '../utils/GeometryWorker';

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
export const COUNTY_LAYERS = ['counties_fill', 'counties_boundary', 'counties_labels'];

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

export const LAYER_LINE_WIDTHS = {
  [BLOCK_LAYER_ID]: 2,
  [BLOCK_LAYER_ID_CHILD]: 1,
};

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

const getDissolved = async () => {
  const {getMapRef} = useMapStore.getState();
  const mapRef = getMapRef();
  if (!mapRef || !GeometryWorker) return;
  const currentView = mapRef.getBounds();
  const {centroids, dissolved} = await GeometryWorker.getCentroidsFromView(
    currentView.getWest(),
    currentView.getSouth(),
    currentView.getEast(),
    currentView.getNorth()
  );
  return {centroids, dissolved};
};

const removeZoneMetaLayers = () => {
  // const {getMapRef} = useMapStore.getState();
  // const mapRef = getMapRef();
  // if (!mapRef) return;
  // ZONE_LABEL_LAYERS.forEach(id => {
  //   mapRef.getLayer(id) && mapRef.removeLayer(id);
  // });
  // ZONE_LABEL_LAYERS.forEach(id => {
  //   mapRef.getSource(id) && mapRef.removeSource(id);
  // });
};

const addZoneMetaLayers = async ({
  centroids,
  dissolved,
}: {
  centroids?: GeoJSON.FeatureCollection;
  dissolved?: GeoJSON.FeatureCollection;
}) => {
  // const geoms =
  //   centroids && dissolved
  //     ? {
  //         centroids,
  //         dissolved,
  //       }
  //     : await getDissolved();
  // const {getMapRef} = useMapStore.getState();
  // const mapRef = getMapRef();
  // if (!mapRef || !geoms) return;
  // const zoneLabelSource = mapRef.getSource('ZONE_LABEL');
  // if (!zoneLabelSource) {
  //   mapRef.addSource('ZONE_LABEL', {
  //     type: 'geojson',
  //     data: geoms.centroids,
  //   });
  //   mapRef.addLayer({
  //     id: 'ZONE_LABEL_BG',
  //     type: 'circle',
  //     source: 'ZONE_LABEL',
  //     paint: {
  //       'circle-color': '#fff',
  //       'circle-radius': 15,
  //       'circle-opacity': 0.8,
  //       'circle-stroke-color': ZONE_LABEL_STYLE || '#000',
  //       'circle-stroke-width': 2,
  //     },
  //     filter: ['==', ['get', 'zone'], ['get', 'zone']],
  //   });
  //   mapRef.addLayer({
  //     id: 'ZONE_LABEL',
  //     type: 'symbol',
  //     source: 'ZONE_LABEL',
  //     layout: {
  //       'text-field': ['get', 'zone'],
  //       'text-font': ['Barlow Bold'],
  //       'text-size': 18,
  //       'text-anchor': 'center',
  //       'text-offset': [0, 0],
  //     },
  //     paint: {
  //       'text-color': '#000',
  //     },
  //   });
  // } else {
  //   // @ts-ignore behavior is correct, typing on `source` is wrong
  //   zoneLabelSource.setData(geoms.centroids);
  // }
};

const debouncedAddZoneMetaLayers = throttle(addZoneMetaLayers, 1000, {
  leading: true,
  trailing: true,
});

export {
  removeZoneMetaLayers,
  addZoneMetaLayers,
  getDissolved,
  debouncedAddZoneMetaLayers,
};
