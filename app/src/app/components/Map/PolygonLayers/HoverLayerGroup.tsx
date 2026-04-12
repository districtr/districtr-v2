import type React from 'react';
import {BLOCK_SOURCE_ID, getHoverLayerIds} from '@/app/constants/map/layerIds';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer, LayerProps} from 'react-map-gl/maplibre';

export const HoverLayerGroup: React.FC<{
  idBase: string;
  sourceLayerId?: string;
  filter: FilterSpecification;
  layerBeforeId: string;
}> = ({idBase, sourceLayerId, filter, layerBeforeId}) => {
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const fillOpacity = isOverlay ? 0.3 : 0.1;
  const {fillId, lineId} = getHoverLayerIds(idBase);

  const lineLayerProps: LayerProps = {
    id: lineId,
    source: BLOCK_SOURCE_ID,
    'source-layer': sourceLayerId,
    filter,
    beforeId: layerBeforeId,
    type: 'line',
    layout: {visibility: 'visible'},
    paint: {
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
      'line-color': '#000000',
      'line-width': 1,
    },
  };
  const fillLayerProps: LayerProps = {
    id: fillId,
    source: BLOCK_SOURCE_ID,
    'source-layer': sourceLayerId,
    filter,
    beforeId: lineId,
    type: 'fill',
    layout: {visibility: 'visible'},
    paint: {
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
      'fill-color': '#000000',
    },
  };
  return (
    <>
      <Layer {...lineLayerProps} />
      <Layer {...fillLayerProps} />
    </>
  );
};
