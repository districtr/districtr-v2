import React, {useLayoutEffect, useState} from 'react';
import {Source} from 'react-map-gl/maplibre';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerStyle';
import {useMapStore} from '@/app/store/mapStore';
import {TILESET_URL} from '@/app/utils/api/constants';
import {useClearMap} from '@/app/hooks/useClearMap';

export const BlockSource: React.FC<{children: React.ReactNode}> = ({children}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const flushMapState = useMapStore(state => state.flushMapState);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);

  const [loadedTiles, setLoadedTiles] = useState('');
  useClearMap(mapDocument?.document_id);

  useLayoutEffect(() => {
    setMapRenderingState('loaded');
  }, [setMapRenderingState]);

  useLayoutEffect(() => {
    if (mapDocument?.tiles_s3_path) {
      setLoadedTiles(mapDocument.tiles_s3_path);
    }
  }, [mapDocument?.tiles_s3_path]);

  if (!mapDocument || !mapDocument.tiles_s3_path) return null;
  if (flushMapState) return null;
  if (loadedTiles !== mapDocument.tiles_s3_path) return null;

  return (
    <Source
      id={BLOCK_SOURCE_ID}
      type="vector"
      url={`pmtiles://${TILESET_URL}/${mapDocument.tiles_s3_path}`}
      promoteId="path"
    >
      {children}
    </Source>
  );
};
