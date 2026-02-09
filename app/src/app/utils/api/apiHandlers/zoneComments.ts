/**
 * API handlers for document-level comments (zone comments).
 * Create and update are optimistic -- persisted when the map is saved
 * via PUT /api/assignments (putUpdateAssignmentsAndVerify).
 * Delete uses DELETE /api/document/{document_id}/comments/{comment_id}.
 */
import {del} from '../factory';

interface DocumentCommentResponse {
  comment_id: string;
  zone?: number | null;
  text: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a single document comment optimistically.
 * A temporary comment_id is generated; it will be replaced on the next save.
 */
export const postZoneComment = async (
  documentId: string,
  zone: number,
  text: string
): Promise<{ok: true; response: DocumentCommentResponse} | {ok: false; error: string}> => {
  return {
    ok: true,
    response: {
      comment_id: crypto.randomUUID(),
      zone,
      text,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
};

/**
 * Update an existing document comment optimistically.
 * Actual persistence happens on save.
 */
export const patchZoneComment = async (
  commentId: string,
  text: string
): Promise<{ok: true; response: DocumentCommentResponse} | {ok: false; error: string}> => {
  return {
    ok: true,
    response: {
      comment_id: commentId,
      text,
      updated_at: new Date().toISOString(),
    },
  };
};

/**
 * Delete a document comment by ID via the backend.
 */
export const deleteZoneComment = async (
  documentId: string,
  commentId: string
): Promise<{ok: true} | {ok: false; error: string}> => {
  const response = await del<object, object>(
    `document/${documentId}/comments/${commentId}`
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
