import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
  LABELS_BREAK_LAYER_ID,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';


export const HighlightOverlayerLayerGroup: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const shatterIds = useMapStore(state => state.shatterIds);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapStore(state => state.mapOptions.showDemographicMap) === 'overlay';

  const layerFilter = useMemo(() => {
    const ids = child ? shatterIds.children : shatterIds.parents;
    const cleanIds = Boolean(ids) ? Array.from(ids) : [];
    const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];
    return child ? filterBase : (['!', filterBase] as FilterSpecification);
  }, [shatterIds, child]);

  const fillOpacity = isOverlay ? 0.3 : 0.1;

  if (!id || !mapDocument) return null;

  return (
    <>
      <Layer
        id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography_hover'}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], fillOpacity, 0],
          'fill-color': '#000000',
        }}
      />
      <Layer
        id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography_line'}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
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
    </>
  );
};
