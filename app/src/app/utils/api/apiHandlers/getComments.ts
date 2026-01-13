/**
 * API handlers for fetching public comments.
 *
 * These are used by the CommentGallery component to display comments
 * in CMS-managed pages. Comments must pass moderation before appearing.
 */
import {get} from '../factory';

/** Response shape for individual comments from the public listing endpoint */
export interface CommentListing {
  title: string;
  comment: string;
  first_name: string;
  last_name: string;
  place: string;
  state: string;
  zip_code: string;
  created_at: Date;
  tags?: string[];
}

/** Filter options for querying public comments */
export interface CommentFilters {
  /** Filter by specific comment IDs */
  ids?: number[];
  /** Filter by tag slugs */
  tags?: string[];
  /** Filter by commenter's place/city */
  place?: string;
  /** Filter by commenter's state */
  state?: string;
  /** Filter by commenter's zip code */
  zipCode?: string;
  /** Pagination offset */
  offset?: number;
  /** Number of results to return */
  limit?: number;
}

/**
 * Fetch public comments with optional filters.
 * Only returns comments that have passed all moderation gates.
 */
export const getPublicComments = async (filters: CommentFilters) => {
  const searchParams = new URLSearchParams();

  if (filters.ids) {
    filters.ids.forEach(id => {
      searchParams.append('ids', id.toString());
    });
  } else if (filters.tags) {
    filters.tags.forEach(tag => {
      searchParams.append('tags', tag);
    });
  }

  if (filters.place) {
    searchParams.append('place', filters.place);
  }
  if (filters.state) {
    searchParams.append('state', filters.state);
  }
  if (filters.zipCode) {
    searchParams.append('zipCode', filters.zipCode);
  }
  if (filters.offset) {
    searchParams.append('offset', filters.offset.toString());
  }
  if (filters.limit) {
    searchParams.append('limit', filters.limit.toString());
  }

  const queryString = searchParams.toString();
  const path = `comments/list${queryString ? `?${queryString}` : ''}`;
  return await get<CommentListing[]>(path)({});
};
