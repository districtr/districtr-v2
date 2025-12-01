'use client';
import {Flex} from '@radix-ui/themes';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useMapStore} from '@/app/store/mapStore';
import {MapTitleDisplay} from './MapTitleDisplay';
import { DocumentMetadata } from '@/app/utils/api/apiHandlers/types';

export const MapHeader: React.FC<{
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({handleMetadataChange}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMetadata = useMapMetadata();

  return (
    <Flex direction="row" align="center" gapX="2">
      <MapTitleDisplay
        mapMetadata={mapMetadata}
        mapDocument={mapDocument}
        handleMetadataChange={handleMetadataChange}
      />
    </Flex>
  );
};
