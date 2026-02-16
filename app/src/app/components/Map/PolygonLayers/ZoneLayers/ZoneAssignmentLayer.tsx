import {BLOCK_SOURCE_ID, ZONE_ASSIGNMENT_STYLE} from '@/app/constants/layers';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {DataDrivenPropertyValueSpecification, FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';

export function ZoneAssignmentLayer({
  id,
  sourceLayerId,
  filter,
  beforeId,
  style,
}: {
  id: string;
  sourceLayerId: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    baseFillOpacity?: DataDrivenPropertyValueSpecification<number>;
  };
}) {
  const baseFillOpacity = style?.baseFillOpacity ?? 0.7;

  const colorScheme = useColorScheme();
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const fillOpacity = useMemo(
    () =>
      [
        'case',
        // Show assignment color only where a zone is assigned.
        ['!', ['==', ['feature-state', 'zone'], null]],
        baseFillOpacity,
        0,
      ] as unknown as DataDrivenPropertyValueSpecification<number>,
    [baseFillOpacity]
  );

  return (
    <Layer
      id={id}
      source={BLOCK_SOURCE_ID}
      source-layer={sourceLayerId}
      filter={filter}
      beforeId={beforeId}
      type="fill"
      layout={{visibility: showPaintedDistricts ? 'visible' : 'none'}}
      paint={{
        'fill-opacity': fillOpacity,
        'fill-color': ZONE_ASSIGNMENT_STYLE(colorScheme) || '#000000',
      }}
    />
  );
}
