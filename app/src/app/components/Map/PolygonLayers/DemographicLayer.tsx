import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {Layer} from 'react-map-gl/maplibre';

export function DemographicParentLayer({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const id = mapDocument?.parent_layer;
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const overlayOpacity = useMapControlsStore(state => state.mapOptions.overlayOpacity);
  const fillId = `${BLOCK_HOVER_LAYER_ID}${isOverlay ? '_overlay' : ''}`;

  if (!id || !mapDocument) return null;
  return (
    <>
      <Layer
        id={fillId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={['literal', true]}
        beforeId={layerBeforeId}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
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
    </>
  );
}

export function DemographicChildLayer({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const id = mapDocument?.child_layer;
  const isOverlay = useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const overlayOpacity = useMapControlsStore(state => state.mapOptions.overlayOpacity);
  const layerFilter = useLayerFilter(true);
  const fillId = `${BLOCK_HOVER_LAYER_ID_CHILD}${isOverlay ? '_overlay' : ''}`;

  if (!id || !mapDocument) return null;
  return (
    <>
      <Layer
        id={fillId}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={layerFilter}
        beforeId={layerBeforeId}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
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
    </>
  );
}
