import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {Layer} from 'react-map-gl/maplibre';

export function ParentHoverLayerGroup({
  child = false,
  layerBeforeId,
}: {
  child?: boolean;
  layerBeforeId: string;
}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const fillOpacity = isOverlay ? 0.3 : 0.1;
  const fillId = (child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography_hover';
  const lineId = (child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_line';

  if (!id || !mapDocument) return null;

  return (
    <>
      <Layer
        id={lineId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={['literal', true]}
        beforeId={layerBeforeId}
        type="line"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'line-color': '#000000',
          'line-width': 1,
        }}
      />
      <Layer
        id={fillId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={['literal', true]}
        beforeId={lineId}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'fill-color': '#000000',
        }}
      />
    </>
  );
}

export function ChildHoverLayerGroup({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const id = mapDocument?.child_layer;
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const layerFilter = useLayerFilter(true);
  const fillOpacity = isOverlay ? 0.3 : 0.1;
  const fillId = BLOCK_HOVER_LAYER_ID_CHILD + '_demography_hover';
  const lineId = BLOCK_HOVER_LAYER_ID_CHILD + '_line';

  if (!id || !mapDocument) return null;

  return (
    <>
      <Layer
        id={lineId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={layerFilter}
        beforeId={layerBeforeId}
        type="line"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'line-color': '#000000',
          'line-width': 1,
        }}
      />
      <Layer
        id={fillId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={layerFilter}
        beforeId={lineId}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'fill-color': '#000000',
        }}
      />
    </>
  );
}
