/**
 * Local record of draft submissions created alongside maps started from a
 * portal (POST /api/create_document with portal_id). The submission_id UUID
 * is the finalize capability — held client-side like the document edit UUID.
 */

const STORAGE_KEY = 'draft-submissions';

export interface DraftSubmission {
  submissionId: string;
  portalId: string;
  /** The portal's collection mode at creation time; 'prompt' opens the
   * submit modal on ready-to-share. Absent on legacy records. */
  collectionMode?: string | null;
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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors (private mode, quota) — same policy as
    // utils/api/session.ts; the draft flow degrades to "no prompt".
  }
};

export const getDraftSubmission = (documentId?: string | null): DraftSubmission | null => {
  if (!documentId) return null;
  const entry = readAll()[documentId];
  // Shape-check: a corrupt/legacy value would otherwise flow into
  // getFormConfig(undefined) and dead-end the modal with no way to clear it.
  return entry && typeof entry === 'object' && entry.submissionId && entry.portalId ? entry : null;
};

export const setDraftSubmission = (documentId: string, draft: DraftSubmission) => {
  const all = readAll();
  // Prune finalized entries — the registry is otherwise append-only.
  for (const [key, entry] of Object.entries(all)) {
    if (entry?.submitted) delete all[key];
  }
  writeAll({...all, [documentId]: draft});
};

export const updateDraftSubmission = (documentId: string, updates: Partial<DraftSubmission>) => {
  const all = readAll();
  if (!all[documentId]) return;
  writeAll({...all, [documentId]: {...all[documentId], ...updates}});
};
