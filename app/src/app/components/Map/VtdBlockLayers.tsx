import {
  BLOCK_SOURCE_ID,
} from '@/app/constants/layers';
import {useDemographyStore} from '@/app/store/demographicMap';
import {useMapStore} from '@/app/store/mapStore';
import {useLayoutEffect, useState} from 'react';
import {useEffect} from 'react';
import {Source, useMap} from 'react-map-gl/maplibre';
import {getDemographyColorScale} from '@/app/utils/demography/colorScales';
import { ZoneLayerGroup } from './ZoneLayerGroup';
import { DemographicLayer } from './DemographicLayer';
import { HighlightOverlayerLayerGroup } from './HighlightOverlayLayerGroup';

export const VtdBlockLayers: React.FC<{
  isDemographicMap?: boolean;
}> = ({isDemographicMap}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const showDemographicMap = useMapStore(state => state.mapOptions.showDemographicMap);
  const demographicVariable = useDemographyStore(state => state.variable);
  const setScale = useDemographyStore(state => state.setScale);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const shatterIds = useMapStore(state => state.shatterIds);
  const [clearOldSource, setClearOldSource] = useState(false);
  const showDemography = isDemographicMap || showDemographicMap === 'overlay';
  const mapRef = useMap();
  const numberOfBins = useDemographyStore(state => state.numberOfBins);

  useEffect(() => {
    // clears old source before re-adding
    setClearOldSource(true);
    setTimeout(() => {
      setClearOldSource(false);
      setMapRenderingState('loaded');
    }, 10);
  }, [mapDocument?.tiles_s3_path]);

  const handleDemographyRender = ({numberOfBins}: {numberOfBins?: number}) => {
    const _map = mapRef.current?.getMap();
    if (_map) {
      const updateFn = () => {
        const mapScale = getDemographyColorScale({
          variable: demographicVariable,
          mapRef: _map,
          shatterIds,
          mapDocument,
          numberOfBins: numberOfBins || 5,
        }) as any;
        setScale(mapScale);
        return mapScale;
      };
      const sourceIsLoaded = _map?.getSource(BLOCK_SOURCE_ID);
      if (sourceIsLoaded) {
        return updateFn();
      } else {
        _map.on('load', () => {
          const r = updateFn();
          if (r) {
            _map.off('load', updateFn);
          }
        });
      }
    }
    return false;
  };

  useLayoutEffect(() => {
    if (showDemography) {
      handleDemographyRender({numberOfBins});
    }
  }, [
    numberOfBins,
    showDemography,
    demographicVariable,
    demographyDataHash,
    shatterIds,
    mapDocument,
  ]);

  if (!mapDocument || clearOldSource) return null;

  return (
    <>
      <Source
        id={BLOCK_SOURCE_ID}
        type="vector"
        url={`pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/${mapDocument.tiles_s3_path}`}
        promoteId="path"
      >
        {!isDemographicMap && (
          <>
            <ZoneLayerGroup />
            <ZoneLayerGroup child />
          </>
        )}
        {!!showDemography && (
          <>
            <DemographicLayer />
            <DemographicLayer child />
          </>
        )}
        <HighlightOverlayerLayerGroup />
        <HighlightOverlayerLayerGroup child />
      </Source>
    </>
  );
};
