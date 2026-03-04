import React, {useLayoutEffect, useMemo} from 'react';
import {Source} from 'react-map-gl/maplibre';
import {useQuery} from '@tanstack/react-query';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useClearMap} from '@/app/hooks/useClearMap';
import {getPublicDistricts} from '@/app/utils/api/apiHandlers/getPublicDistricts';

export const PublicSource: React.FC<{children: React.ReactNode}> = ({children}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const flushMapState = useMapStore(state => state.flushMapState);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const setStateFp = useMapControlsStore(state => state.setStateFp);

  useClearMap(mapDocument?.document_id);

  const publicDistrictsQuery = useQuery({
    queryKey: ['public-districts', mapDocument?.public_id],
    queryFn: () => getPublicDistricts(mapDocument),
    enabled: Boolean(mapDocument?.access === 'read' && mapDocument?.public_id),
  });

  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: publicDistrictsQuery.data?.geojsonFeatures ?? [],
    };
  }, [publicDistrictsQuery.data?.geojsonFeatures]);

  useLayoutEffect(() => {
    if (!publicDistrictsQuery.data) return;
    if (publicDistrictsQuery.data.statefp) {
      setStateFp(publicDistrictsQuery.data.statefp);
    }
    setMapRenderingState('loaded');
  }, [publicDistrictsQuery.data, setMapRenderingState, setStateFp]);

  if (!mapDocument || mapDocument.access !== 'read') return null;
  if (flushMapState || publicDistrictsQuery.isPending) return null;
  if (publicDistrictsQuery.isError || !publicDistrictsQuery.data) return null;

  return (
    <Source id={BLOCK_SOURCE_ID} type="geojson" data={featureCollection} promoteId="path">
      {children}
    </Source>
  );
};
