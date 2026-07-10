import type React from 'react';
import {getLayerFill} from '@/app/constants/map/layerStyle';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {ZoneAssignmentLayer} from './ZoneAssignmentLayer';
import {ZoneHighlightLayer} from './ZoneHighlightLayer';

export const ZoneLayerGroup: React.FC<{
  ids: {
    highlightId: string;
    assignmentId: string;
  };
  sourceLayerId?: string;
  filter: FilterSpecification;
  layerBeforeId: string;
}> = ({ids, sourceLayerId, filter, layerBeforeId}) => {
  const captiveIds = useMapStore(state => state.captiveIds);
  const isOverlayed =
    useMapControlsStore(state => state.mapOptions.demographicDisplayMode) === 'overlay';
  const zonesOpacity = useMapControlsStore(state => state.mapOptions.zonesOpacity ?? 1);
  const layerOpacity = useMemo(() => {
    const fill = getLayerFill(captiveIds, isOverlayed);
    // Scale the whole fill expression by the user's districts-layer opacity.
    return zonesOpacity === 1 ? fill : (['*', fill, zonesOpacity] as typeof fill);
  }, [captiveIds, isOverlayed, zonesOpacity]);
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
};
