import {get, post} from '../factory';

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

  // Admin fields
  comment_id: number;
  comment_review_status: ReviewStatus | null;
  comment_moderation_score: number | null;
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
  tags?: string[];
  place?: string;
  state?: string;
  zip_code?: string;
  max_moderation_score?: number;
}

// GET endpoints
export const getAdminCommentsList = async (params: ReviewListParams = {}, session?: any) => {
  const searchParams: Record<string, string | number | boolean | (string | number)[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams[key] = value;
    }
  }

  const response = await get<ReviewItem[]>('comments/admin/list')({
    session,
    queryParams: searchParams,
  });
  return response;
};

// POST endpoints for updating review status
export const reviewItem = async (
  itemId: number,
  reviewStatus: ReviewStatus,
  entryType: 'comment' | 'commenter' | 'tag',
  session?: any
): Promise<{ok: true; message: string} | {ok: false; error: string}> => {
  const response = await post<ReviewStatusUpdate, {message: string; comment_id: number}>(
    `comments/admin/review`
  )({
    body: {
      review_status: reviewStatus,
      content_type: entryType,
      id: itemId,
    },
    session,
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
