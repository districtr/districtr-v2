import {
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
  getLayerFill,
} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneAssignmentLayer} from './ZoneAssignmentLayer';
import {ZoneHighlightLayer} from './ZoneHighlightLayer';
import {useMemo} from 'react';

export default function ZoneChildLayerGroup({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const sourceLayerId = mapDocument?.child_layer;
  const layerFilter = useLayerFilter(true);
  const captiveIds = useMapStore(state => state.captiveIds);
  const isOverlayed =
    useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const layerOpacity = useMemo(
    () => getLayerFill(captiveIds, true, isOverlayed),
    [captiveIds, isOverlayed]
  );

  if (!sourceLayerId) return null;

  return (
    <>
      <ZoneHighlightLayer
        id={BLOCK_LAYER_ID_HIGHLIGHT_CHILD}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        beforeId={layerBeforeId}
      />
      <ZoneAssignmentLayer
        id={BLOCK_HOVER_LAYER_ID_CHILD}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        beforeId={BLOCK_LAYER_ID_HIGHLIGHT_CHILD}
        baseFillOpacity={layerOpacity}
      />
    </>
  );
}
