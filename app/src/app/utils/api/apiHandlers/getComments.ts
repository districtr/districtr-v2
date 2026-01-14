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
  first_name: string | null;
  last_name: string | null;
  place: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: Date;
  tags?: string[];
  zone?: number | null;
  /** Public ID of the associated map, if any */
  public_id?: number | null;
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
  /** Search in title and comment text */
  search?: string;
  /** Filter for comments with/without maps */
  hasMap?: boolean;
}

/** Convert camelCase to snake_case for API query params */
const toSnakeCase = (str: string): string =>
  str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

/**
 * Fetch public comments with optional filters.
 * Only returns comments that have passed all moderation gates.
 */
export const getPublicComments = async (filters: CommentFilters) => {
  const queryParams: Record<string, string | number | boolean | (string | number)[]> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      // Convert camelCase keys to snake_case for backend API
      queryParams[toSnakeCase(key)] = value;
    }
  }
  return await get<CommentListing[]>('comments/list')({queryParams});
};
