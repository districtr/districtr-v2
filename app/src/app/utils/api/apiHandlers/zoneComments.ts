/**
 * API handlers for zone-level comments.
 * These are used by the map editor to save district-level comments.
 */
import {post} from '../factory';
import {ZoneComment} from './types';

interface ZoneCommentCreate {
  title: string;
  comment: string;
  zone: number;
}

interface BatchZoneCommentsRequest {
  document_id: string;
  comments: ZoneCommentCreate[];
}

interface BatchZoneCommentsResponse {
  document_id: string;
  created_count: number;
  comments: ZoneComment[];
}

/**
 * Save multiple zone comments for a document.
 * This is called during manual save to persist local comments to the server.
 */
export const postBatchZoneComments = async (
  documentId: string,
  comments: ZoneComment[]
): Promise<
  | {
      ok: true;
      response: BatchZoneCommentsResponse;
    }
  | {
      ok: false;
      error: string;
    }
> => {
  // Filter to only local comments that need saving
  const commentsToSave: ZoneCommentCreate[] = comments
    .filter(c => c.isLocal)
    .map(c => ({
      title: c.title,
      comment: c.comment,
      zone: c.zone,
    }));

  if (commentsToSave.length === 0) {
    return {
      ok: true,
      response: {
        document_id: documentId,
        created_count: 0,
        comments: [],
      },
    };
  }

  const response = await post<BatchZoneCommentsRequest, BatchZoneCommentsResponse>(
    'comments/batch_zone_comments'
  )({
    body: {
      document_id: documentId,
      comments: commentsToSave,
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error.detail,
    };
  }

  return {
    ok: true,
    response: response.response,
  };
};
