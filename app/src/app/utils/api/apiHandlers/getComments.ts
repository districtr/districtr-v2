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
  const queryParams: Record<string, string | number | boolean | (string | number)[]> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      queryParams[key] = value;
    }
  }
  return await get<CommentListing[]>('comments/list')({queryParams});
};
