'use client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import React, {useEffect, useMemo} from 'react';
import {handleWheelOrPinch} from '@utils/events/mapEvents';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {NavigationControl} from 'react-map-gl/maplibre';
import {CountyLayers} from './PolygonLayers/CountyLayers';
import {MetaLayers} from './PointLayers/MetaLayers';
import {OverlayLayers} from './PolygonLayers/OverlayLayers';
import {MapLayerAnchors} from './MapLayerAnchors';
import {MapContainer} from './MapContainer';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';
import {useFitMapToBounds} from '@/app/hooks/useFitMapToBounds';
import {PointSource} from './GeoSources/PointSource';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {PublicSource} from './GeoSources/PublicSource';
import {PublicDistrictLayers} from './PolygonLayers/PublicDistrictLayers';
import {BlockDemographicLayers} from './PolygonLayers/BlockDemographicLayers';
import {BlockSource} from './GeoSources/BlockSource';
import type {FilterSpecification} from 'maplibre-gl';
import {RENDERER_TYPES} from '@constants/map/rendererType';

export const PublicMap: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const {mapRef, onLoad} = useMapRenderer(RENDERER_TYPES.MAIN, true);
  const hasDemographicOverlay =
    useMapControlsStore(state => state.mapOptions.demographicDisplayMode) === 'overlay';

  const initialViewState = useMemo(
    () => ({...useMapControlsStore.getState().lastMapViewState}),
    [mapOptions.bounds, mapDocument?.document_id]
  );

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => maplibregl.removeProtocol('pmtiles');
  }, []);

  const fitMapToBounds = useFitMapToBounds(mapRef, mapOptions.bounds);

  return (
    <MapContainer
      mapRef={mapRef}
      initialViewState={initialViewState}
      onMapLoad={e => {
        onLoad(e);
        setMapRef(mapRef);
        handleWheelOrPinch(new MouseEvent('wheel'), mapRef.current);
        fitMapToBounds();
      }}
    >
      <MapLayerAnchors />
      <CountyLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.counties} />
      <PublicSource>
        <PublicDistrictLayers />
      </PublicSource>
      {hasDemographicOverlay && (
        <BlockSource>
          {!!mapDocument?.parent_layer && (
            <BlockDemographicLayers
              scope="PARENT"
              layerFilter={['literal', true] as FilterSpecification}
              outlineFilter={['literal', true] as FilterSpecification}
              sourceLayerId={mapDocument.parent_layer}
            />
          )}
        </BlockSource>
      )}
      <OverlayLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.overlays} />
      <PointSource>
        <MetaLayers isDemographicMap={false} />
      </PointSource>
      <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
    </MapContainer>
  );
};
