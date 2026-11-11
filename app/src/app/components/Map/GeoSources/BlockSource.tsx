import React, {useLayoutEffect, useState} from 'react';
import {Source} from 'react-map-gl/maplibre';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {blocksTilesUrl, splitsTiles} from '@/app/constants/map/sources';
import {useClearMap} from '@/app/hooks/useClearMap';
import {RENDERING_STATES} from '@constants/map/renderingState';

export const BlockSource: React.FC<{children: React.ReactNode}> = ({children}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const flushMapState = useMapStore(state => state.flushMapState);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);

  const documentId = mapDocument?.document_id;
  // Blocks draw only inside shattered parents, in district or community mode.
  const hasShattered = useAssignmentsStore(state => state.shatterIds.parents.size > 0);
  const hasShatteredCoi = useCoiAssignmentsStore(state => state.shatterIds.parents.size > 0);
  const needsBlocks = hasShattered || hasShatteredCoi;
  // The document that has needed blocks. It keeps the combined archive from then on, so
  // undoing its last shatter leaves the source as it is.
  const [blocksDocument, setBlocksDocument] = useState<string>();

  const [loadedTiles, setLoadedTiles] = useState('');
  useClearMap(mapDocument?.document_id);

  useLayoutEffect(() => {
    setMapRenderingState(RENDERING_STATES.LOADED);
  }, [setMapRenderingState]);

  useLayoutEffect(() => {
    if (mapDocument?.tiles_s3_path) {
      setLoadedTiles(mapDocument.tiles_s3_path);
    }
  }, [mapDocument?.tiles_s3_path]);

  useLayoutEffect(() => {
    if (needsBlocks && documentId) setBlocksDocument(documentId);
  }, [needsBlocks, documentId]);

  if (!mapDocument || !mapDocument.tiles_s3_path) return null;
  if (flushMapState) return null;
  if (loadedTiles !== mapDocument.tiles_s3_path) return null;

  const parentOnly = splitsTiles(mapDocument) && !needsBlocks && blocksDocument !== documentId;

  // A change of url reloads the tiles in place: the layers and feature-state stay.
  return (
    <Source
      id={BLOCK_SOURCE_ID}
      type="vector"
      url={blocksTilesUrl(mapDocument.tiles_s3_path, parentOnly)}
      promoteId="path"
    >
      {children}
    </Source>
  );
};
