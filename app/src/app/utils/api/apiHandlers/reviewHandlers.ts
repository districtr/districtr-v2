import {get, post, QueryParams} from '../factory';
import {ClientSession} from '@/app/lib/auth0';

export const REVIEW_STATUS_ENUM = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVIEWED: 'REVIEWED',
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS_ENUM)[keyof typeof REVIEW_STATUS_ENUM];
export interface ReviewItem {
  // Common fields
  review_status?: ReviewStatus;
  created_at?: string;
  title: string;
  comment: string;
  first_name: string | null;
  last_name: string | null;
  place: string | null;
  state: string | null;
  zip_code: string | null;
  tags: Array<string | null>;
  zone?: number | null;
  public_id?: number | null;
  document_id?: string | null;

  // Admin fields
  comment_id: number;
  comment_review_status: ReviewStatus | null;
  comment_moderation_score: number | null;
  comment_review_flagged?: boolean;
  commenter_id: number | null;
  commenter_review_status: ReviewStatus | null;
  commenter_moderation_score: number | null;
  tag_ids: Array<number | null>;
  tag_review_status: Array<ReviewStatus | null>;
  tag_moderation_score: Array<number | null>;
}

export interface ReviewStatusUpdate {
  review_status: ReviewStatus;
  content_type: 'comment' | 'commenter' | 'tag';
  id: number;
}

export interface ReviewListParams {
  offset?: number;
  limit?: number;
  review_status?: ReviewStatus | null;
  review_flagged?: boolean;
  tags?: string[];
  place?: string;
  state?: string;
  zip_code?: string;
  comment_id?: number;
  max_moderation_score?: number;
}

export interface DistrictCommentsListParams {
  offset?: number;
  limit?: number;
  review_status?: ReviewStatus | null;
  review_flagged?: boolean;
  document_id?: string;
  public_id?: number;
  comment_id?: number;
  place?: string;
  state?: string;
  zip_code?: string;
  max_moderation_score?: number;
}
/*
 * Filters out null, undefined, and empty strings from the params object.
 * This is to prevent API calls with invalid parameters.
 */
const filterNullUndefinedParams = (params: ReviewListParams) => {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([_, value]) => value !== undefined && value !== null && value !== ''
    )
  ) as QueryParams;
};

// GET endpoints
export const getAdminCommentsList = async (
  params: ReviewListParams = {},
  session?: ClientSession | null
) => {
  const response = await get<ReviewItem[]>('comments/admin/list')({
    session: session ?? undefined,
    queryParams: filterNullUndefinedParams(params),
  });
  return response;
};

export const getAdminDistrictCommentsList = async (
  params: DistrictCommentsListParams = {},
  session?: ClientSession | null
) => {
  const response = await get<ReviewItem[]>('comments/admin/district-comments/list')({
    session: session ?? undefined,
    queryParams: filterNullUndefinedParams(params),
  });
  return response;
};

// POST endpoint for flagging a comment for review (user-facing, no auth)
export const flagComment = async (
  commentId: number
): Promise<{ok: true; message: string} | {ok: false; error: string}> => {
  const response = await post<{comment_id: number}, {message: string; comment_id: number}>(
    'comments/flag'
  )({
    body: {comment_id: commentId},
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error?.detail,
    };
  }

  return {
    ok: true,
    message: response.response.message,
  };
};

// POST endpoints for updating review status
export const reviewItem = async (
  itemId: number,
  reviewStatus: ReviewStatus,
  entryType: 'comment' | 'commenter' | 'tag',
  session?: ClientSession | null
): Promise<{ok: true; message: string} | {ok: false; error: string}> => {
  const response = await post<ReviewStatusUpdate, {message: string; comment_id: number}>(
    `comments/admin/review`
  )({
    body: {
      review_status: reviewStatus,
      content_type: entryType,
      id: itemId,
    },
    session: session ?? undefined,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error.detail,
    };
  }

  return {
    ok: true,
    message: response.response.message,
  };
};
