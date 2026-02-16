import {
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {Layer} from 'react-map-gl/maplibre';

export function HoverLayerGroup({
  idBase,
  sourceLayerId,
  filter,
  layerBeforeId,
}: {
  idBase: string;
  sourceLayerId: string;
  filter: FilterSpecification;
  layerBeforeId: string;
}) {
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const fillOpacity = isOverlay ? 0.3 : 0.1;
  const fillId = `${idBase}_demography_hover`;
  const lineId = `${idBase}_line`;

  return (
    <>
      <Layer
        id={lineId}
        source={BLOCK_SOURCE_ID}
        source-layer={sourceLayerId}
        filter={filter}
        beforeId={layerBeforeId}
        type="line"
        layout={{visibility: 'visible'}}
        paint={{
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'line-color': '#000000',
          'line-width': 1,
        }}
      />
      <Layer
        id={fillId}
        source={BLOCK_SOURCE_ID}
        source-layer={sourceLayerId}
        filter={filter}
        beforeId={lineId}
        type="fill"
        layout={{visibility: 'visible'}}
        paint={{
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'fill-color': '#000000',
        }}
      />
    </>
  );
}
