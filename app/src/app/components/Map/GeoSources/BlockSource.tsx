import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {Source, useMap} from 'react-map-gl/maplibre';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {blocksTilesUrl, splitsTiles} from '@/app/constants/map/sources';
import {
  followBlockTiles,
  markBlockTilesReady,
  requestBlockTiles,
  useBlockTilesStore,
} from '@utils/map/blockTiles';
import {useClearMap} from '@/app/hooks/useClearMap';
import {RENDERING_STATES} from '@constants/map/renderingState';
import {MAP_MODES} from '@constants/map/mode';
import {ACTIVE_TOOLS} from '@constants/map/tools';

export const BlockSource: React.FC<{children: React.ReactNode}> = ({children}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const flushMapState = useMapStore(state => state.flushMapState);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const {current: mapRef} = useMap();

  // Blocks draw only inside shattered parents, and the Break tool is about to make one.
  // Loading them while the tool is selected has them in place before the click.
  const breakSelected = useMapControlsStore(state => state.activeTool === ACTIVE_TOOLS.SHATTER);
  const coiMode = useMapControlsStore(state => state.mapMode === MAP_MODES.COI);
  const hasShattered = useAssignmentsStore(state => state.shatterIds.parents.size > 0);
  const hasShatteredCoi = useCoiAssignmentsStore(state => state.shatterIds.parents.size > 0);
  const needsBlocks = breakSelected || (coiMode ? hasShatteredCoi : hasShattered);
  const combinedFor = useBlockTilesStore(state => state.combinedFor);

  const tilesPath = mapDocument?.tiles_s3_path ?? undefined;
  const split = !!mapDocument && splitsTiles(mapDocument);
  const parentOnly = split && !needsBlocks && combinedFor !== mapDocument?.document_id;
  const url = tilesPath ? blocksTilesUrl(tilesPath, parentOnly) : undefined;

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
    if (needsBlocks) requestBlockTiles(mapDocument);
  }, [needsBlocks, mapDocument]);

  // The source's last url for this tileset. A source that mounts on the combined archive
  // has all its tiles from it; one that changes to it is followed until it does.
  const last = useRef<{tilesPath?: string; url?: string}>({});
  useEffect(() => {
    const changed = last.current.tilesPath === tilesPath && last.current.url !== url;
    last.current = {tilesPath, url};
    const map = mapRef?.getMap();
    if (!map || !url || !split || parentOnly) return;
    if (!changed) return markBlockTilesReady();
    return followBlockTiles(map, url);
  }, [mapRef, tilesPath, url, split, parentOnly]);

  if (!mapDocument || !url) return null;
  if (flushMapState) return null;
  if (loadedTiles !== mapDocument.tiles_s3_path) return null;

  // A change of url reloads the tiles in place: the layers and feature-state stay.
  return (
    <Source id={BLOCK_SOURCE_ID} type="vector" url={url} promoteId="path">
      {children}
    </Source>
  );
};
