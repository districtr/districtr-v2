import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer} from 'react-map-gl/maplibre';

export const DemographicLayer: React.FC<{
  idBase: string;
  sourceLayerId: string;
  filter: FilterSpecification;
  layerBeforeId: string;
}> = ({
  idBase,
  sourceLayerId,
  filter,
  layerBeforeId,
}) => {
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const overlayOpacity = useMapControlsStore(state => state.mapOptions.overlayOpacity);
  const fillId = `${idBase}${isOverlay ? '_overlay' : ''}`;

  return (
    <Layer
      id={fillId}
      source={BLOCK_SOURCE_ID}
      source-layer={sourceLayerId}
      filter={filter}
      beforeId={layerBeforeId}
      type="fill"
      layout={{visibility: 'visible'}}
      paint={{
        'fill-opacity': isOverlay ? overlayOpacity : 0.9,
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'hasColor'], false],
          ['feature-state', 'color'],
          '#808080',
        ],
      }}
    />
  );
};
