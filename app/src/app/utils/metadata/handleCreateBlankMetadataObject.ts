import {DocumentMetadata} from '../api/apiHandlers/types';

export const handleCreateBlankMetadataObject = (): DocumentMetadata => {
  return {
    name: null,
    group: null,
    tags: null,
    description: null,
    draft_status: 'scratch',
    eventId: null,
  };
};
