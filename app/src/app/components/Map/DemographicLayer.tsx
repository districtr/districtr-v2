import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
  getLayerFill,
  LABELS_BREAK_LAYER_ID,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';

export const DemographicLayer: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const shatterIds = useMapStore(state => state.shatterIds);
  const captiveIds = useMapStore(state => state.captiveIds);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapStore(state => state.mapOptions.showDemographicMap) === 'overlay';

  const layerFilter = useMemo(() => {
    const ids = child ? shatterIds.children : shatterIds.parents;
    const cleanIds = Boolean(ids) ? Array.from(ids) : [];
    const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];
    return child ? filterBase : (['!', filterBase] as FilterSpecification);
  }, [shatterIds, child]);

  const layerOpacity = useMemo(
    () =>
      isOverlay
        ? 0.4
        : getLayerFill(captiveIds, child ? shatterIds.children : shatterIds.parents, child, true),
    [captiveIds, shatterIds, child, isOverlay]
  );

  if (!id || !mapDocument) return null;

  return (
    <Layer
      id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography'}
      source={BLOCK_SOURCE_ID}
      source-layer={id}
      filter={child ? layerFilter : ['literal', true]}
      beforeId={LABELS_BREAK_LAYER_ID}
      type="fill"
      layout={{
        visibility: 'visible',
      }}
      paint={{
        'fill-opacity': layerOpacity,
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
