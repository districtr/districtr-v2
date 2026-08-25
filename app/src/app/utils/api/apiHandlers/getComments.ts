/**
 * API handlers for fetching public submissions (the CommentGallery data
 * source). There is no approval gate: everything visible is served, with
 * `nsfw` marking entries the UI blurs behind an opt-in reveal.
 */
import {get, post} from '../factory';

/** Raw row from GET /api/submissions (backend SubmissionPublic). */
interface SubmissionPublic {
  id: number;
  portal_id: string;
  tags: string[];
  nsfw: boolean;
  map_public_id: number | null;
  created_at: string | null;
  submitted_at: string | null;
  /** Sparse field values; private fields (email) never appear. */
  fields: Record<string, string>;
}

/** Flattened row shape the gallery renderers consume. */
export interface CommentListing {
  /** Submission id (for the report/flag action) */
  id: number;
  title: string;
  comment: string;
  first_name: string | null;
  last_name: string | null;
  place: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: Date;
  tags?: string[];
  /** Blur this entry until the reader opts in */
  nsfw: boolean;
  /** Public ID of the associated map, if any */
  public_id?: number | null;
}

/** Filter options for querying public submissions */
export interface CommentFilters {
  /** Filter by specific submission IDs (curated galleries) */
  ids?: number[];
  /** Filter by tag slugs */
  tags?: string[];
  /** Filter by a specific portal */
  portalId?: string;
  place?: string;
  state?: string;
  zipCode?: string;
  offset?: number;
  limit?: number;
  /** Search in title and comment text */
  search?: string;
  /** Filter for submissions with/without maps */
  hasMap?: boolean;
}

/** Convert camelCase to snake_case for API query params */
const toSnakeCase = (str: string): string =>
  str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

const flatten = (row: SubmissionPublic): CommentListing => ({
  id: row.id,
  title: row.fields.title ?? '',
  comment: row.fields.comment ?? '',
  first_name: row.fields.first_name ?? null,
  last_name: row.fields.last_name ?? null,
  place: row.fields.place ?? null,
  state: row.fields.state ?? null,
  zip_code: row.fields.zip_code ?? null,
  created_at: new Date(row.submitted_at ?? row.created_at ?? 0),
  tags: row.tags,
  nsfw: row.nsfw,
  public_id: row.map_public_id,
});

/** Fetch visible public submissions with optional filters. */
export const getPublicComments = async (
  filters: CommentFilters
): Promise<{ok: true; response: CommentListing[]} | {ok: false; error: {detail: string}}> => {
  const queryParams: Record<string, string | number | boolean | (string | number)[]> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParams[toSnakeCase(key)] = value;
    }
  }
  const response = await get<SubmissionPublic[]>('submissions')({queryParams});
  if (!response.ok) return response;
  return {ok: true, response: response.response.map(flatten)};
};

/** Report a submission for moderator review. */
export const flagSubmission = async (id: number) =>
  post<{id: number}, {message: string}>('submissions/flag')({body: {id}});
