import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {sourceLayerProp} from '@/app/constants/map/layerStyle';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer, LayerProps} from 'react-map-gl/maplibre';

export const ZoneHighlightLayer: React.FC<{
  id: string;
  sourceLayerId?: string;
  filter: FilterSpecification;
  beforeId: string;
}> = ({id, sourceLayerId, filter, beforeId}) => {
  const highlightUnassigned = useMapControlsStore(state => state.mapOptions.higlightUnassigned);
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);

  const layerProps: LayerProps = {
    id,
    source: BLOCK_SOURCE_ID,
    filter,
    beforeId,
    type: 'line' as const,
    layout: {
      visibility: showPaintedDistricts ? 'visible' : 'none',
      'line-cap': 'round',
    },
    paint: {
      'line-opacity': 1,
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'focused'], false],
        '#000000',
        ['boolean', ['feature-state', 'highlighted'], false],
        '#e5ff00',
        // @ts-ignore right behavior, wrong types
        ['==', ['feature-state', 'zone'], null],
        '#FF0000',
        '#000000',
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
        0,
      ],
    },
  };

  return <Layer {...layerProps} {...sourceLayerProp(sourceLayerId)} />;
};
