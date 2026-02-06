/**
 * API handlers for zone-level comments.
 * Comments are saved on clicking Save in the comment popover - no need to save the map.
 */
import {post, patch, del} from '../factory';
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

interface ZoneCommentResponse {
  id: number;
  title: string;
  comment: string;
  zone: number;
  created_at?: string;
  updated_at?: string;
}

interface BatchZoneCommentsResponse {
  document_id: string;
  created_count: number;
  comments: ZoneCommentResponse[];
}

/**
 * Create a single zone comment. Use when saving a new comment from the popover.
 */
export const postZoneComment = async (
  documentId: string,
  zone: number,
  title: string,
  comment: string
): Promise<
  | {ok: true; response: ZoneCommentResponse}
  | {ok: false; error: string}
> => {
  const response = await post<BatchZoneCommentsRequest, BatchZoneCommentsResponse>(
    'comments/batch_zone_comments'
  )({
    body: {
      document_id: documentId,
      comments: [{zone, title, comment}],
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error.detail,
    };
  }

  const created = response.response.comments[0];
  if (!created) {
    return {
      ok: false,
      error: 'No comment returned from server',
    };
  }

  return {
    ok: true,
    response: created,
  };
};

/**
 * Update an existing zone comment.
 */
export const patchZoneComment = async (
  commentId: number,
  title: string,
  comment: string
): Promise<
  | {ok: true; response: ZoneCommentResponse}
  | {ok: false; error: string}
> => {
  const response = await patch<{title: string; comment: string}, ZoneCommentResponse>(
    `comments/zone_comments/${commentId}`
  )({
    body: {title, comment},
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

/**
 * Delete a zone comment.
 */
export const deleteZoneComment = async (commentId: number): Promise<
  | {ok: true}
  | {ok: false; error: string}
> => {
  const response = await del<object, object>(
    `comments/zone_comments/${commentId}`
  )({});

  if (!response.ok) {
    const errorMessage =
      typeof response.error === 'string'
        ? response.error
        : (response.error as {detail?: string})?.detail ?? 'Failed to delete comment';
    return {
      ok: false,
      error: errorMessage,
    };
  }

  return {ok: true};
};
