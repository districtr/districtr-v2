/**
 * Local record of draft submissions created alongside maps started from a
 * portal (POST /api/create_document with portal_id). The submission_id UUID
 * is the finalize capability — held client-side like the document edit UUID.
 */

const STORAGE_KEY = 'draft-submissions';

export interface DraftSubmission {
  submissionId: string;
  portalId: string;
  /** User declined the ready-to-share prompt; keep the manual button only. */
  suppressed?: boolean;
  /** Finalized — nothing left to prompt for. */
  submitted?: boolean;
}

type DraftSubmissionMap = Record<string, DraftSubmission>;

const readAll = (): DraftSubmissionMap => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
};

const writeAll = (all: DraftSubmissionMap) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

export const getDraftSubmission = (documentId?: string | null): DraftSubmission | null =>
  (documentId && readAll()[documentId]) || null;

export const setDraftSubmission = (documentId: string, draft: DraftSubmission) => {
  writeAll({...readAll(), [documentId]: draft});
};

export const updateDraftSubmission = (documentId: string, updates: Partial<DraftSubmission>) => {
  const all = readAll();
  if (!all[documentId]) return;
  writeAll({...all, [documentId]: {...all[documentId], ...updates}});
};
