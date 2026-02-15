import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_LAYER_ID_HIGHLIGHT,
  getLayerFill,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {ZoneAssignmentLayer} from './ZoneAssignmentLayer';
import {ZoneHighlightLayer} from './ZoneHighlightLayer';

export default function ZoneParentLayerGroup({layerBeforeId}: {layerBeforeId: string}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const sourceLayerId = mapDocument?.parent_layer;
  const layerFilter = ['literal', true] as FilterSpecification;
  const captiveIds = useMapStore(state => state.captiveIds);
  const isOverlayed =
    useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const layerOpacity = useMemo(
    () => getLayerFill(captiveIds, false, isOverlayed),
    [captiveIds, isOverlayed]
  );

  if (!sourceLayerId) return null;

  return (
    <>
      <ZoneHighlightLayer
        id={BLOCK_LAYER_ID_HIGHLIGHT}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        beforeId={layerBeforeId}
      />
      <ZoneAssignmentLayer
        id={BLOCK_HOVER_LAYER_ID}
        sourceLayerId={sourceLayerId}
        filter={layerFilter}
        beforeId={BLOCK_LAYER_ID_HIGHLIGHT}
        baseFillOpacity={layerOpacity}
      />
    </>
  );
}
