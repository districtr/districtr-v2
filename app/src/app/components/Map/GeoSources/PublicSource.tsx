import React, {useEffect, useLayoutEffect, useMemo} from 'react';
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
  const setAvailableColumnSets = useDemographyStore(state => state.setAvailableColumnSets);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  useClearMap(mapDocument?.document_id);

  const publicDistrictsQuery = useQuery({
    queryKey: ['public-districts', mapDocument?.public_id],
    queryFn: () => getPublicDistricts(mapDocument),
    enabled: Boolean(mapDocument?.access === 'read' && mapDocument?.public_id),
  });

  useEffect(() => {
    if (publicDistrictsQuery.isError) {
      setErrorNotification({
        message: publicDistrictsQuery.error?.message || 'Failed to fetch public district stats',
        severity: 2,
      });
    }
  }, [publicDistrictsQuery.isError, publicDistrictsQuery.error, setErrorNotification]);

  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: 'FeatureCollection',
      features: publicDistrictsQuery.data?.geojsonFeatures ?? [],
    };
  }, [publicDistrictsQuery.data?.geojsonFeatures]);

  useLayoutEffect(() => {
    // This side effect basically handles all the data loading logic for public maps
    // Because the data here is so much smaller, we can skip the assignment store stuff
    // This is faster, which matters for public maps where lots of people may be viewing
    // But few would edit
    if (!publicDistrictsQuery.data) return;
    if (publicDistrictsQuery.data.statefp) {
      setStateFp(publicDistrictsQuery.data.statefp);
    }

    // Feed demographic data into demographyService for sidebar stats
    const {columns, demographicData, assignments} = publicDistrictsQuery.data;
    const hash = `anonymous|${mapDocument?.public_id}`;
    demographyService.update(Array.from(columns), demographicData, hash, [], assignments);
    setDemographyHash(hash);

    // Set available column sets so sidebar knows which columns are available
    setAvailableColumnSets(getAvailableColumnSets(demographyService.availableColumns));

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
