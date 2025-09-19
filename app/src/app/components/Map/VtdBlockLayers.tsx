import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {useLayoutEffect, useState} from 'react';
import {Source} from 'react-map-gl/maplibre';
import {ZoneLayerGroup} from './ZoneLayerGroup';
import {DemographicLayer} from './DemographicLayer';
import {HighlightOverlayerLayerGroup} from './HighlightOverlayLayerGroup';
import {useClearMap} from '@/app/hooks/useClearMap';
import {PointSelectionLayer} from './PointSelectionLayer';
import {TILESET_URL} from '@/app/utils/api/constants';
import {useChoroplethRenderer} from '@/app/hooks/useChoroplethRenderer';

export const VtdBlockLayers: React.FC<{
  isDemographicMap?: boolean;
}> = ({isDemographicMap}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const showDemographicMap = useMapStore(state => state.mapOptions.showDemographicMap);
  const [loadedTiles, setLoadedTiles] = useState('');
  const showDemography = isDemographicMap || showDemographicMap === 'overlay';
  useClearMap(mapDocument?.document_id);
  useChoroplethRenderer();

  useLayoutEffect(() => {
    // on mount, set map rendering state to loaded
    setMapRenderingState('loaded');
  }, []);

  useLayoutEffect(() => {
    if (mapDocument?.tiles_s3_path) {
      setLoadedTiles(mapDocument.tiles_s3_path);
    }
  }, [mapDocument?.tiles_s3_path]);

  if (!mapDocument || loadedTiles !== mapDocument.tiles_s3_path) return null;

  return (
    <>
      <Source
        id={BLOCK_SOURCE_ID}
        type="vector"
        url={`pmtiles://${TILESET_URL}/${mapDocument.tiles_s3_path}`}
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
      <PointSelectionLayer />
      <PointSelectionLayer child />
    </>
  );
};
