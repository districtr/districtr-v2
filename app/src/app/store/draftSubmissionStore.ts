import {create} from 'zustand';

/** UI state for the submit-to-portal prompt (SubmitToPortalModal). */
interface DraftSubmissionPromptState {
  /** Document whose draft submission the modal is offering to finalize. */
  promptDocumentId: string | null;
  openPrompt: (documentId: string) => void;
  closePrompt: () => void;
}

export const useDraftSubmissionStore = create<DraftSubmissionPromptState>(set => ({
  promptDocumentId: null,
  openPrompt: documentId => set({promptDocumentId: documentId}),
  closePrompt: () => set({promptDocumentId: null}),
}));
