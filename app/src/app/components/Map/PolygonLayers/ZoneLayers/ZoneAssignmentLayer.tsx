import type React from 'react';
import {ZONE_ASSIGNMENT_STYLE, ZONE_LABEL_STYLE} from '@/app/constants/map/layerStyle';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {DataDrivenPropertyValueSpecification, FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer, LayerProps} from 'react-map-gl/maplibre';

export const ZoneAssignmentLayer: React.FC<{
  id: string;
  sourceLayerId?: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    baseFillOpacity?: DataDrivenPropertyValueSpecification<number>;
  };
}> = ({id, sourceLayerId, filter, beforeId, style}) => {
  const baseFillOpacity = style?.baseFillOpacity ?? 0.7;
  const isGeoJsonSource = !sourceLayerId;

  const colorScheme = useColorScheme();
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const fillOpacity = useMemo(
    () =>
      isGeoJsonSource
        ? baseFillOpacity
        : ([
            'case',
            // Show assignment color only where a zone is assigned.
            ['!', ['==', ['feature-state', 'zone'], null]],
            baseFillOpacity,
            0,
          ] as unknown as DataDrivenPropertyValueSpecification<number>),
    [baseFillOpacity, isGeoJsonSource]
  );

  const layerProps: LayerProps = {
    id,
    source: BLOCK_SOURCE_ID,
    filter,
    beforeId,
    type: 'fill' as const,
    layout: {visibility: showPaintedDistricts ? 'visible' : 'none'},
    paint: {
      'fill-opacity': fillOpacity,
      'fill-color':
        (isGeoJsonSource ? ZONE_LABEL_STYLE(colorScheme) : ZONE_ASSIGNMENT_STYLE(colorScheme)) ||
        '#000000',
    },
  };

  return <Layer {...layerProps} {...(sourceLayerId ? {'source-layer': sourceLayerId} : {})} />;
};
