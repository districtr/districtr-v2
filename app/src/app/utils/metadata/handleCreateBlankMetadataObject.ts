import {DocumentMetadata} from '../api/apiHandlers/types';
import {DRAFT_STATUSES} from '@constants/map/draftStatus';

export const handleCreateBlankMetadataObject = (): DocumentMetadata => {
  return {
    name: null,
    group: null,
    tags: null,
    description: null,
    draft_status: DRAFT_STATUSES.SCRATCH,
    eventId: null,
  };
};
