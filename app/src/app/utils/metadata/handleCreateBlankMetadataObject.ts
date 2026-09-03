import {DocumentMetadata} from '../api/apiHandlers/types';
import {DRAFT_STATUSES} from '@constants/document/draftStatus';

export const handleCreateBlankMetadataObject = (): DocumentMetadata => {
  return {
    name: null,
    group: null,
    tags: null,
    description: null,
    draft_status: DRAFT_STATUSES.SCRATCH,
    event_id: null,
  };
};
