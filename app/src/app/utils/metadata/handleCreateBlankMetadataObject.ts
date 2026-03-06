import {DocumentMetadata} from '../api/apiHandlers/types';
import {DEFAULT_DRAFT_STATUS} from '@/app/constants/map/draftStatus';

export const handleCreateBlankMetadataObject = (): DocumentMetadata => {
  return {
    name: null,
    group: null,
    tags: null,
    description: null,
    draft_status: DEFAULT_DRAFT_STATUS,
    eventId: null,
  };
};
