'use client';
import { Flex} from '@radix-ui/themes';
import {useMapMetadata} from '@/app/hooks/useMapMetadata';
import {useMapStore} from '@/app/store/mapStore';
import {MapTitleDisplay} from './MapTitleDisplay';
import {MapStatus} from './MapStatus';
import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {DEFAULT_MAP_METADATA} from '@/app/utils/language';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {useRouter} from 'next/navigation';
import { MapContextModuleAndUnits } from './MapContextModuleAndUnits';

export const MapHeader: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMetadata = useMapMetadata();
  const router = useRouter();

  const handleMetadataChange = async (updates: Partial<DocumentMetadata>) => {
    const newDocument = await saveMap({
      ...(mapMetadata || DEFAULT_MAP_METADATA),
      ...updates,
    });
    if (newDocument) {
      router.push(`/map/edit/${newDocument.document_id}`);
    }
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
      <MapContextModuleAndUnits />

    </Flex>
  );
};
