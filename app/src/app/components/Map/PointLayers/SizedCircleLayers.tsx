'use client';
import React from 'react';
import {Layer} from 'react-map-gl/maplibre';
import {
  CANONICAL_LAYER_IDS,
  SELECTION_POINTS_SOURCE_ID,
  SELECTION_POINTS_SOURCE_ID_CHILD,
} from '@/app/constants/map/layerIds';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

/**
 * Proportional symbol layer for the "Sized circles" display mode: circles at
 * unit centroids, radius and color set via feature-state by
 * demographyService.paintSizedCircles.
 */
export const SizedCircleLayer: React.FC<{child?: boolean}> = ({child = false}) => {
  const isSizedCircles =
    useMapControlsStore(state => state.mapOptions.demographicDisplayMode) ===
    DEMOGRAPHIC_MODES.SIZED_CIRCLES;
  const layerFilter = useLayerFilter(child);
  if (!isSizedCircles) return null;
  return (
    <Layer
      id={CANONICAL_LAYER_IDS.BLOCK[child ? 'CHILD' : 'PARENT'].SIZED_CIRCLES}
      source={child ? SELECTION_POINTS_SOURCE_ID_CHILD : SELECTION_POINTS_SOURCE_ID}
      filter={layerFilter}
      type="circle"
      layout={{visibility: 'visible'}}
      paint={{
        'circle-radius': ['coalesce', ['feature-state', 'radius'], 0],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'hasColor'], false],
          ['feature-state', 'color'],
          '#CCCCCC',
        ],
        // Transparency comes from the color ramp's alpha (transparent -> black)
        'circle-opacity': 1,
      }}
    />
  );
};
