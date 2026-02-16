import {getLayerFill} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {ZoneAssignmentLayer} from './ZoneAssignmentLayer';
import {ZoneHighlightLayer} from './ZoneHighlightLayer';

export function ZoneLayerGroup({
  ids,
  sourceLayerId,
  filter,
  layerBeforeId,
}: {
  ids: {
    highlightId: string;
    assignmentId: string;
  };
  sourceLayerId: string;
  filter: FilterSpecification;
  layerBeforeId: string;
}) {
  const captiveIds = useMapStore(state => state.captiveIds);
  const isOverlayed =
    useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const layerOpacity = useMemo(
    () => getLayerFill(captiveIds, isOverlayed),
    [captiveIds, isOverlayed]
  );

  if (!sourceLayerId) return null;

  return (
    <>
      <ZoneHighlightLayer
        id={ids.highlightId}
        sourceLayerId={sourceLayerId}
        filter={filter}
        beforeId={layerBeforeId}
      />
      <ZoneAssignmentLayer
        id={ids.assignmentId}
        sourceLayerId={sourceLayerId}
        filter={filter}
        beforeId={ids.highlightId}
        style={{baseFillOpacity: layerOpacity}}
      />
    </>
  );
}
