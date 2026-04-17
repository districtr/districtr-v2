'use client';
import maplibregl, {FilterSpecification} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {MAP_OPTIONS} from '@constants/map/viewDefaults';
import {useMapStore} from '@store/mapStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {NavigationControl} from 'react-map-gl/maplibre';
import {CountyLayers} from './PolygonLayers/CountyLayers';
import {BlockSource} from './GeoSources/BlockSource';
import {MetaLayers} from './PointLayers/MetaLayers';
import {PointSelectionLayer} from './PointLayers/PointSelectionLayer';
import {OverlayLayers} from './PolygonLayers/OverlayLayers';
import {MapLayerAnchors} from './MapLayerAnchors';
import {MapContainer} from './MapContainer';
// @ts-ignore plugin has no types
import syncMaps from '@mapbox/mapbox-gl-sync-move';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';
import {PointSource} from './GeoSources/PointSource';
import {BlockDemographicLayers} from './PolygonLayers/BlockDemographicLayers';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useAnchorLayersReady} from '@/app/hooks/useAnchorLayersReady';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

export const DemographicMap: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentOutlineFilter = useLayerFilter(false);
  const childLayerFilter = useLayerFilter(true);
  const getStateMapRef = useMapStore(state => state.getMapRef);
  const synced = useRef<false | (() => void)>(false);
  const {mapRef, onLoad} = useMapRenderer('demographic');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const basemap = useMapControlsStore(state => state.mapOptions.basemap);
  const areAnchorLayersReady = useAnchorLayersReady(mapRef, isMapLoaded, basemap);

  const initialViewState = useMemo(() => {
    const mainMapRef = getStateMapRef();
    if (!mainMapRef) return;
    const center = mainMapRef.getCenter();
    const zoom = mainMapRef.getZoom();
    return {
      latitude: center.lat,
      longitude: center.lng,
      zoom: zoom ?? MAP_OPTIONS.zoom ?? 3,
    };
  }, [getStateMapRef]);

  const handleSyncMaps = useCallback(
    (demoMapRef?: maplibregl.Map) => {
      const mainMapRef = getStateMapRef();
      if (!demoMapRef || !mainMapRef || synced.current !== false) return;
      synced.current = syncMaps(demoMapRef, mainMapRef);
    },
    [getStateMapRef]
  );

  useEffect(() => {
    handleSyncMaps(mapRef.current?.getMap());
    return () => {
      if (synced.current) {
        synced.current();
        synced.current = false;
      }
      useDemographyStore.getState().unmount();
      mapRef.current = null;
    };
  }, [handleSyncMaps, mapRef]);

  return (
    <MapContainer
      mapRef={mapRef}
      initialViewState={initialViewState}
      borderLeft
      onMapLoad={e => {
        onLoad(e);
        handleSyncMaps(e.target);
        useDemographyStore.getState().setGetMapRef(() => e.target);
        setIsMapLoaded(true);
      }}
    >
      {isMapLoaded && <MapLayerAnchors />}
      {areAnchorLayersReady && (
        <>
          <CountyLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.counties} />
          <BlockSource>
            {!!mapDocument?.parent_layer && (
              <BlockDemographicLayers
                scope="PARENT"
                layerFilter={['literal', true] as FilterSpecification}
                outlineFilter={parentOutlineFilter}
                sourceLayerId={mapDocument.parent_layer}
              />
            )}
            {!!mapDocument?.child_layer && (
              <BlockDemographicLayers
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
            <MetaLayers isDemographicMap={true} />
          </PointSource>
          <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
        </>
      )}
    </MapContainer>
  );
};
