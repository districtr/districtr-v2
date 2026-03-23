import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {DataDrivenPropertyValueSpecification, FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';

export const CoiAssignmentLayer: React.FC<{
  id: string;
  membershipKey: string;
  color: string;
  sourceLayerId: string;
  filter: FilterSpecification;
  beforeId: string;
  style?: {
    baseFillOpacity?: DataDrivenPropertyValueSpecification<number>;
  };
}> = ({id, membershipKey, color, sourceLayerId, filter, beforeId, style}) => {
  const baseFillOpacity = style?.baseFillOpacity ?? 0.7;

  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const fillOpacity = useMemo(
    () =>
      [
        'case',
        ['boolean', ['feature-state', membershipKey], false],
        baseFillOpacity,
        0,
      ] as unknown as DataDrivenPropertyValueSpecification<number>,
    [baseFillOpacity, membershipKey]
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
        'fill-color': color,
      }}
    />
  );
};
