import React, {useLayoutEffect, useMemo} from 'react';
import {Source} from 'react-map-gl/maplibre';
import {useQuery} from '@tanstack/react-query';
import {PUBLIC_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useClearMap} from '@/app/hooks/useClearMap';
import {getPublicDistricts} from '@/app/utils/api/apiHandlers/getPublicDistricts';
import {demographyService} from '@/app/utils/demography/demographyService';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {getAvailableColumnSets} from '@/app/utils/demography/getAvailableColumnSets';
import GeometryWorker from '@/app/utils/GeometryWorker';

export const PublicSource: React.FC<{children: React.ReactNode}> = ({children}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const flushMapState = useMapStore(state => state.flushMapState);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const setStateFp = useMapControlsStore(state => state.setStateFp);
  const setDemographyHash = useDemographyStore(state => state.setDataHash);
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

    // Feed demographic data into demographyService for sidebar stats
    const {columns, demographicData, assignments} = publicDistrictsQuery.data;
    const hash = `anonymous|${mapDocument?.public_id}`;
    demographyService.update(Array.from(columns), demographicData, hash, assignments);
    setDemographyHash(hash);

    // Set available column sets so sidebar knows which columns are available
    useDemographyStore
      .getState()
      .setAvailableColumnSets(getAvailableColumnSets(demographyService.availableColumns));

    // Load public geometries into GeometryWorker for zone label centroids
    GeometryWorker?.setPublicFeatures(publicDistrictsQuery.data.geojsonFeatures);

    setMapRenderingState('loaded');
  }, [publicDistrictsQuery.data, setMapRenderingState, setStateFp, mapDocument?.public_id]);

  if (!mapDocument || mapDocument.access !== 'read') return null;
  if (flushMapState || publicDistrictsQuery.isPending) return null;
  if (publicDistrictsQuery.isError || !publicDistrictsQuery.data) return null;

  return (
    <Source id={PUBLIC_SOURCE_ID} type="geojson" data={featureCollection} promoteId="path">
      {children}
    </Source>
  );
};
