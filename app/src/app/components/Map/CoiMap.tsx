'use client';
import {FilterSpecification} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {registerPmtilesProtocol} from '@/app/utils/map/pmtilesProtocol';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {MAP_OPTIONS} from '@constants/map/viewDefaults';
import {handleWheelOrPinch} from '@utils/events/mapEvents';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {NavigationControl} from 'react-map-gl/maplibre';
import {CountyLayers} from './PolygonLayers/CountyLayers';
import {BlockSource} from './GeoSources/BlockSource';
import {MetaLayers} from './PointLayers/MetaLayers';
import {PointSelectionLayer} from './PointLayers/PointSelectionLayer';
import {SizedCircleLayer} from './PointLayers/SizedCircleLayers';
import {OverlayLayers} from './PolygonLayers/OverlayLayers';
import {MapLayerAnchors} from './MapLayerAnchors';
import {CoiMapContainer} from './CoiMapContainer';
import {BlockModePill} from './BlockModePill';
import {PaintConstraintPill} from './PaintConstraintPill';
import {useMapRenderer} from '@/app/hooks/useMapRenderer';
import {PointSource} from './GeoSources/PointSource';
import {CoiBlockLayers} from './PolygonLayers/CoiBlockLayers';
import {MAP_LAYER_ANCHOR_IDS} from '@/app/constants/map/layerIds';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useAnchorLayersReady} from '@/app/hooks/useAnchorLayersReady';
import {RENDERER_TYPES} from '@constants/map/rendererType';

/**
 * COI (Community of Interest) map component. Mirrors MainMap layout and layers;
 * used on /coi/{public_id} and /coi/{public_id}/edit.
 */
export const CoiMap: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentOutlineFilter = useLayerFilter(false);
  const childLayerFilter = useLayerFilter(true);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const {mapRef, onLoad} = useMapRenderer(RENDERER_TYPES.MAIN);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const areAnchorLayersReady = useAnchorLayersReady(mapRef, isMapLoaded, mapOptions.basemap);

  const initialViewState = useMemo(() => {
    const center = MAP_OPTIONS.center as [number, number];
    return {
      latitude: center[1],
      longitude: center[0],
      zoom: MAP_OPTIONS.zoom ?? 3,
    };
  }, []);

  useEffect(() => {
    registerPmtilesProtocol();
  }, []);

  const fitMapToBounds = useCallback(() => {
    if (!mapRef.current || !mapOptions.bounds) return;
    mapRef.current.fitBounds(mapOptions.bounds, {
      padding: 20,
      animate: false,
    });
  }, [mapRef, mapOptions.bounds]);

  useEffect(() => {
    fitMapToBounds();
  }, [fitMapToBounds]);

  return (
    <CoiMapContainer
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
          <CountyLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.countyBoundaries} />
          <BlockSource>
            {!!mapDocument?.parent_layer && (
              <CoiBlockLayers
                scope="PARENT"
                layerFilter={['literal', true] as FilterSpecification}
                outlineFilter={parentOutlineFilter}
                sourceLayerId={mapDocument.parent_layer}
              />
            )}
            {!!mapDocument?.child_layer && (
              <CoiBlockLayers
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
            <SizedCircleLayer />
            <SizedCircleLayer child />
            <MetaLayers isDemographicMap={false} />
          </PointSource>
          <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
          {/* COI breaks units too, and the pill is the only exit from block view. */}
          <BlockModePill />
          <PaintConstraintPill />
        </>
      )}
    </CoiMapContainer>
  );
};
