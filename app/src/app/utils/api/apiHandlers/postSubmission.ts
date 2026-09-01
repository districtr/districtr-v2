import {post, put} from '../factory';

export interface SubmissionCreate {
  portal_id: string;
  fields: Record<string, string>;
  tags: string[];
  /** Document reference (UUID or public id); the backend clones the plan. */
  map_ref?: string | null;
  turnstile_token: string;
}

export interface SubmissionCreated {
  id: number;
  submission_id: string;
}

type Result = {ok: true; data: SubmissionCreated} | {ok: false; error: string};

const formatError = (detail: unknown): string =>
  // Aggregated validation errors are list[str]; FastAPI's own request
  // validation is list[{msg,...}] — normalize both, never "[object Object]".
  Array.isArray(detail)
    ? detail
        .map(d => (typeof d === 'string' ? d : ((d as {msg?: string})?.msg ?? JSON.stringify(d))))
        .join('; ')
    : String(detail);

export const postSubmission = async (body: SubmissionCreate): Promise<Result> => {
  const response = await post<SubmissionCreate, SubmissionCreated>('submissions')({body});
  if (!response.ok) {
    return {ok: false, error: formatError(response.error.detail)};
  }
  return {ok: true, data: response.response};
};

export interface SubmissionFinalize {
  fields: Record<string, string>;
  tags: string[];
  turnstile_token: string;
}

/** Finalize a draft submission (map-from-portal pathway); the submission_id
 * UUID is the write capability returned by createMapDocument. */
export const finalizeSubmission = async (
  submissionId: string,
  body: SubmissionFinalize
): Promise<Result> => {
  const response = await put<SubmissionFinalize, SubmissionCreated>(
    `submissions/${submissionId}/finalize`
  )({body});
  if (!response.ok) {
    return {ok: false, error: formatError(response.error.detail)};
  }
  return {ok: true, data: response.response};
};
