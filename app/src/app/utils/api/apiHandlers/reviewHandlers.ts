import {get, post} from '../factory';

export type ReviewStatus = 'approved' | 'rejected' | 'reviewed';

export interface ReviewItem {
  id: number;
  review_status?: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface Comment extends ReviewItem {
  title: string;
  comment: string;
  commenter_id?: number;
  moderation_score?: number;
}

export interface Tag extends ReviewItem {
  slug: string;
  moderation_score?: number;
}

export interface Commenter extends ReviewItem {
  first_name: string;
  email: string;
  salutation?: string;
  last_name?: string;
  place?: string;
  state?: string;
  zip_code?: string;
  moderation_score?: number;
}

export interface ReviewStatusUpdate {
  review_status: ReviewStatus;
}

export interface ReviewListParams {
  offset?: number;
  limit?: number;
  review_status?: ReviewStatus;
  tags?: string[];
}

// GET endpoints
export const getCommentsForReview = async (
  params: ReviewListParams = {},
  session?: any
): Promise<{ok: true; data: Comment[]} | {ok: false; error: string}> => {
  const searchParams = new URLSearchParams();

  if (params.offset !== undefined) searchParams.append('offset', params.offset.toString());
  if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
  if (params.review_status) searchParams.append('review_status', params.review_status);
  if (params.tags?.length) {
    params.tags.forEach(tag => searchParams.append('tags', tag));
  }

  const queryString = searchParams.toString();
  const path = queryString
    ? `comments/review/comments/list?${queryString}`
    : 'comments/review/comments/list';

  const response = await get<Comment[]>(path)({session});

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

export const getTagsForReview = async (
  params: ReviewListParams = {},
  session?: any
): Promise<{ok: true; data: Tag[]} | {ok: false; error: string}> => {
  const searchParams = new URLSearchParams();

  if (params.offset !== undefined) searchParams.append('offset', params.offset.toString());
  if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
  if (params.review_status) searchParams.append('review_status', params.review_status);

  const queryString = searchParams.toString();
  const path = queryString
    ? `comments/review/tags/list?${queryString}`
    : 'comments/review/tags/list';

  const response = await get<Tag[]>(path)({session});

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

export const getCommentersForReview = async (
  params: ReviewListParams = {},
  session?: any
): Promise<{ok: true; data: Commenter[]} | {ok: false; error: string}> => {
  const searchParams = new URLSearchParams();

  if (params.offset !== undefined) searchParams.append('offset', params.offset.toString());
  if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());
  if (params.review_status) searchParams.append('review_status', params.review_status);

  const queryString = searchParams.toString();
  const path = queryString
    ? `comments/review/commenters/list?${queryString}`
    : 'comments/review/commenters/list';

  const response = await get<Commenter[]>(path)({session});

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
export const reviewComment = async (
  commentId: number,
  reviewStatus: ReviewStatus,
  session?: any
): Promise<{ok: true; message: string} | {ok: false; error: string}> => {
  const response = await post<ReviewStatusUpdate, {message: string; comment_id: number}>(
    `comments/review/comment/${commentId}`
  )({
    body: {review_status: reviewStatus},
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

export const reviewTag = async (
  tagId: number,
  reviewStatus: ReviewStatus,
  session?: any
): Promise<{ok: true; message: string} | {ok: false; error: string}> => {
  const response = await post<ReviewStatusUpdate, {message: string; tag_id: number}>(
    `comments/review/tag/${tagId}`
  )({
    body: {review_status: reviewStatus},
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

export const reviewCommenter = async (
  commenterId: number,
  reviewStatus: ReviewStatus,
  session?: any
): Promise<{ok: true; message: string} | {ok: false; error: string}> => {
  const response = await post<ReviewStatusUpdate, {message: string; commenter_id: number}>(
    `comments/review/commenter/${commenterId}`
  )({
    body: {review_status: reviewStatus},
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
