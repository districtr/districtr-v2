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
  created_at: string;
  updated_at: string;
  title: string;
  comment: string;
  first_name: string | null;
  last_name: string | null;
  place: string | null;
  state: string | null;
  zip_code: string | null;
  tags: Array<string | null>;

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
  reviewStatus?: ReviewStatus | null;
  tags?: string[];
  place?: string;
  state?: string;
  zipCode?: string;
  minModerationScore?: number;
}

// GET endpoints
export const getAdminCommentsList = async (
  params: ReviewListParams = {},
  session?: any
): Promise<{ok: true; data: ReviewItem[]} | {ok: false; error: string}> => {
  const searchParams = new URLSearchParams();

  if (params.offset !== undefined) searchParams.append('offset', params.offset.toString());
  if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
  if (params.reviewStatus) searchParams.append('review_status', params.reviewStatus);
  if (params.tags?.length) {
    params.tags.forEach(tag => searchParams.append('tags', tag));
  }
  if (params.place?.length) searchParams.append('place', params.place);
  if (params.state?.length) searchParams.append('state', params.state);
  if (params.zipCode?.length) searchParams.append('zip_code', params.zipCode);
  if (params.minModerationScore !== undefined)
    searchParams.append('min_moderation_score', params.minModerationScore.toString());

  const queryString = searchParams.toString();
  const path = queryString ? `comments/admin/list?${queryString}` : 'comments/admin/list';

  const response = await get<ReviewItem[]>(path)({session});

  if (!response.ok) {
    return {
      ok: false,
      error: response.error.detail,
    };
  }

  return {
    ok: true,
    data: response.response,
  };
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
