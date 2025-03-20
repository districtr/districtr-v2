import {useDemographyStore} from '@/app/store/demographyStore';
import {useMapStore} from '@/app/store/mapStore';
import React, {useLayoutEffect, useState} from 'react';
import {useEffect} from 'react';
import {Source, useMap} from 'react-map-gl/maplibre';
import {ZoneLayerGroup} from './ZoneLayerGroup';
import {DemographicLayer} from './DemographicLayer';
import {HighlightOverlayerLayerGroup} from './HighlightOverlayLayerGroup';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {DocumentObject} from '@/app/utils/api/apiHandlers';

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
    // only happens on map document change
    setClearOldSource(true);
    setTimeout(() => {
      setClearOldSource(false);
      setMapRenderingState('loaded');
    }, 10);
  }, [mapDocument?.tiles_s3_path, mapDocument?.document_id]);

  const handleDemographyRender = ({numberOfBins}: {numberOfBins?: number}) => {
    const _map = mapRef.current?.getMap();
    if (_map) {
      const updateFn = () => {
        const mapScale = demographyCache.calculateDemographyColorScale({
          variable: demographicVariable,
          mapRef: _map,
          mapDocument,
          numberOfBins: numberOfBins || 5,
          paintMap: true,
        });
        mapScale && setScale(mapScale);
        return mapScale;
      };
      // handle asynchronous map / source loads
      if (_map?.getSource(mapDocument?.parent_layer!)) {
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
    <MapSource mapDocument={mapDocument}>
      <MapSource mapDocument={mapDocument} child>
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
      </MapSource>
    </MapSource>
  );
};

const MapSource: React.FC<{
  children: React.ReactNode;
  mapDocument: DocumentObject;
  child?: boolean;
}> = ({children, mapDocument, child = false}) => {
  if (child && !mapDocument.child_layer) {
    return <React.Fragment>{children}</React.Fragment>;
  } else {
    return (
      <Source
        id={child ? mapDocument.child_layer! : mapDocument.parent_layer!}
        type="vector"
        url={`pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/tilesets/${mapDocument[child ? 'child_layer' : 'parent_layer']}.pmtiles`}
        promoteId="path"
      >
        {children}
      </Source>
    );
  }
};
