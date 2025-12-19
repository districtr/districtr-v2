import {CommentListing} from './types';
import {get} from '../factory';

export const getDocumentComments = async (document_id: string) => {
  return await get<CommentListing[]>('comments/list')({
    queryParams: {
      document_id,
    },
  });
};
