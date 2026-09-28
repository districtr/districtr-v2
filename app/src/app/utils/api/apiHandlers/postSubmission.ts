import {formatErrorDetail, get, post, put} from '../factory';

export interface SubmissionCreate {
  portal_id: string;
  fields: Record<string, string>;
  /** Document reference (UUID or public id); the backend clones the plan. */
  map_ref?: string | null;
  turnstile_token: string;
}

export interface SubmissionCreated {
  id: number;
  submission_id: string;
}

type Result = {ok: true; data: SubmissionCreated} | {ok: false; error: string};

export const postSubmission = async (body: SubmissionCreate): Promise<Result> => {
  const response = await post<SubmissionCreate, SubmissionCreated>('submissions')({body});
  if (!response.ok) {
    return {ok: false, error: formatErrorDetail(response.error.detail)};
  }
  return {ok: true, data: response.response};
};

export interface SubmissionFinalize {
  fields: Record<string, string>;
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
    return {ok: false, error: formatErrorDetail(response.error.detail)};
  }
  return {ok: true, data: response.response};
};

export interface CustomFieldPublic {
  key: string;
  label: string;
  field_type: 'text' | 'textarea';
  required: boolean;
  sort_order: number;
}

export type CollectionMode = 'internal' | 'auto_public' | 'prompt' | 'form';

export interface FormConfigPublic {
  portal_id: string;
  name: string;
  fields: string[];
  required_fields: string[];
  require_email_confirm: boolean;
  collection_mode: CollectionMode;
  custom_fields: CustomFieldPublic[];
}

/** Public read of a portal's form shape (the abbreviated map-submission form). */
export const getFormConfig = async (portalId: string) =>
  get<FormConfigPublic>('submissions/form_config')({queryParams: {portal_id: portalId}});
