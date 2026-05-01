'use client';
import maplibregl, {FilterSpecification} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import React, {useEffect, useMemo, useState} from 'react';
import {handleWheelOrPinch} from '@utils/events/mapEvents';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {NavigationControl} from 'react-map-gl/maplibre';
import {CountyLayers} from './PolygonLayers/CountyLayers';
import {BlockSource} from './GeoSources/BlockSource';
import {MetaLayers} from './PointLayers/MetaLayers';
import {PointSelectionLayer} from './PointLayers/PointSelectionLayer';
import {OverlayLayers} from './PolygonLayers/OverlayLayers';
import {MapLayerAnchors} from './MapLayerAnchors';
import {MapContainer} from './MapContainer';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';
import {PointSource} from './GeoSources/PointSource';
import {BlockLayers} from './PolygonLayers/BlockLayers';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useAnchorLayersReady} from '@/app/hooks/useAnchorLayersReady';
import {useFitMapToBounds} from '@/app/hooks/useFitMapToBounds';
import {RENDERER_TYPES} from '@constants/map/rendererType';

export const MainMap: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentOutlineFilter = useLayerFilter(false);
  const childLayerFilter = useLayerFilter(true);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const {mapRef, onLoad} = useMapRenderer(RENDERER_TYPES.MAIN);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const areAnchorLayersReady = useAnchorLayersReady(mapRef, isMapLoaded, mapOptions.basemap);

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
        handleWheelOrPinch({} as TouchEvent, mapRef.current);
        fitMapToBounds();
        setIsMapLoaded(true);
      }}
    >
      {isMapLoaded && <MapLayerAnchors />}
      {areAnchorLayersReady && (
        <>
          <CountyLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.counties} />
          <BlockSource>
            {!!mapDocument?.parent_layer && (
              <BlockLayers
                scope="PARENT"
                layerFilter={['literal', true] as FilterSpecification}
                outlineFilter={parentOutlineFilter}
                sourceLayerId={mapDocument.parent_layer}
              />
            )}
            {!!mapDocument?.child_layer && (
              <BlockLayers
                scope="CHILD"
                layerFilter={childLayerFilter}
                outlineFilter={childLayerFilter}
                sourceLayerId={mapDocument.child_layer}
              />
            )}
          </BlockSource>
          <OverlayLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.overlays} />
          <PointSource>
            <PointSelectionLayer />
            <PointSelectionLayer child />
            <MetaLayers isDemographicMap={false} />
          </PointSource>
          <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
        </>
      )}
    </MapContainer>
  );
};
