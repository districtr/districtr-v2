import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {MAP_OPTIONS} from '../constants/configuration';
import {mapCallbacks} from '../utils/events/mapEvents';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID,
  BLOCK_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
  BLOCK_SOURCE_ID,
  getBlocksHoverLayerSpecification,
  getBlocksLayerSpecification,
  getHighlightLayerSpecification,
  INTERACTIVE_LAYERS,
  LABELS_BREAK_LAYER_ID,
} from '../constants/layers';
import {useMapStore} from '../store/mapStore';
import GlMap, {Layer, MapRef, NavigationControl, Source, useMap} from 'react-map-gl/maplibre';

export const MapComponent: React.FC = () => {
  const mapRef = useRef<MapRef>(null);
  const mapLock = useMapStore(state => state.mapLock);
  const setMapRef = useMapStore(state => state.setMapRef);
  const mapOptions = useMapStore(state => state.mapOptions);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const mapDocument = useMapStore(state => state.mapDocument);
  const [pmtilesReady, setPmTilesReady] = useState<boolean>(false);
  const [mapReady, setMapReady] = useState<boolean>(false);

  const fitMapToBounds = () => {
    if (mapRef.current && mapOptions.bounds) {
      if (mapOptions.bounds) {
        mapRef.current.fitBounds(mapOptions.bounds, {
          padding: 20,
        });
      }
    }
  };

  useEffect(fitMapToBounds, [mapOptions.bounds]);

  useLayoutEffect(() => {
    pmtilesReady && setMapReady(true);
  }, [pmtilesReady]);

  const handleMapLoad = () => {
    let protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    setPmTilesReady(true);
    const map = mapRef.current?.getMap();
    if (!map) return;
    setMapRef(map);
    map.scrollZoom.setWheelZoomRate(1 / 300);
    map.scrollZoom.setZoomRate(1 / 300);
    fitMapToBounds();
    setMapRenderingState('loaded');
  };

  return (
    <div
      className={`h-full relative w-full flex-1 lg:h-screen landscape:h-screen
    ${mapLock ? 'pointer-events-none' : ''}
    `}
    >
      <GlMap
        ref={mapRef}
        mapStyle={pmtilesReady ? MAP_OPTIONS.style : undefined}
        mapLib={maplibregl}
        maxZoom={MAP_OPTIONS.maxZoom ? MAP_OPTIONS.maxZoom : undefined}
        onLoad={handleMapLoad}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        initialViewState={
          MAP_OPTIONS.center
            ? {
                // @ts-ignore
                longitude: MAP_OPTIONS.center[0],
                // @ts-ignore
                latitude: MAP_OPTIONS.center[1],
                zoom: MAP_OPTIONS.zoom,
              }
            : undefined
        }
        {...mapCallbacks}
      >
        <NavigationControl />
        {mapReady && (
          <Source
            type="vector"
            id={BLOCK_SOURCE_ID}
            url={
              mapDocument?.tiles_s3_path
                ? `pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/${mapDocument?.tiles_s3_path}`
                : undefined
            }
            promoteId={'path'}
          >
            {mapDocument && (
              <>
                <Layer
                  {...getBlocksLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID)}
                  beforeId={LABELS_BREAK_LAYER_ID}
                  id={BLOCK_LAYER_ID}
                  key={`${BLOCK_LAYER_ID}-layer`}
                />

                <Layer
                  {...getBlocksHoverLayerSpecification(
                    mapDocument.parent_layer,
                    BLOCK_HOVER_LAYER_ID
                  )}
                  beforeId={LABELS_BREAK_LAYER_ID}
                  id={BLOCK_HOVER_LAYER_ID}
                  key={`${BLOCK_HOVER_LAYER_ID}-layer`}
                />
              </>
            )}

            {mapDocument?.child_layer && (
              <>
                <Layer
                  {...getBlocksLayerSpecification(mapDocument.child_layer, BLOCK_LAYER_ID_CHILD)}
                  beforeId={LABELS_BREAK_LAYER_ID}
                  id={BLOCK_LAYER_ID_CHILD}
                  key={`${BLOCK_LAYER_ID_CHILD}-layer`}
                />

                <Layer
                  {...getBlocksHoverLayerSpecification(
                    mapDocument.child_layer,
                    BLOCK_HOVER_LAYER_ID_CHILD
                  )}
                  beforeId={LABELS_BREAK_LAYER_ID}
                  id={BLOCK_HOVER_LAYER_ID_CHILD}
                  key={`${BLOCK_HOVER_LAYER_ID_CHILD}-layer`}
                />
                <Layer
                  {...getHighlightLayerSpecification(
                    mapDocument.child_layer,
                    BLOCK_LAYER_ID_HIGHLIGHT_CHILD
                  )}
                  beforeId={LABELS_BREAK_LAYER_ID}
                  id={BLOCK_LAYER_ID_HIGHLIGHT_CHILD}
                  key={`${BLOCK_LAYER_ID_HIGHLIGHT_CHILD}-layer`}
                />
              </>
            )}
            {mapDocument && (
              <Layer
                {...getHighlightLayerSpecification(
                  mapDocument.parent_layer,
                  BLOCK_LAYER_ID_HIGHLIGHT
                )}
                beforeId={LABELS_BREAK_LAYER_ID}
                id={BLOCK_LAYER_ID_HIGHLIGHT}
                key={`${BLOCK_LAYER_ID_HIGHLIGHT}-layer`}
              />
            )}
          </Source>
        )}
      </GlMap>
    </div>
  );
};
