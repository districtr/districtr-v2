'use client';
import {Text, Flex} from '@radix-ui/themes';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useMapStore} from '@/app/store/mapStore';
import {MapTitleDisplay} from './MapTitleDisplay';
import {MapStatus} from './MapStatus';
import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {DEFAULT_MAP_METADATA} from '@/app/utils/language';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';

export const MapHeader: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMetadata = useMapMetadata(mapDocument?.document_id);

  const mapTableName = useMapStore(
    state =>
      state.userMaps.find(userMap => userMap.document_id === state.mapDocument?.document_id)
        ?.name ?? ''
  );
  const handleMetadataChange = async (updates: Partial<DocumentMetadata>) => {
    await saveMap({
      ...(mapMetadata || DEFAULT_MAP_METADATA),
      ...updates,
    });
  };

  return (
    <Flex direction="row" align="center" gapX="2">
      <MapStatus
        mapDocument={mapDocument}
        mapMetadata={mapMetadata}
        handleMetadataChange={handleMetadataChange}
      />
      <MapTitleDisplay
        mapMetadata={mapMetadata}
        mapDocument={mapDocument}
        handleMetadataChange={handleMetadataChange}
      />
      <Text size="2" className="text-gray-500">
        {mapTableName || ''}
      </Text>
    </Flex>
  );
};
