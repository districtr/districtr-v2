import {create} from 'zustand';
import {ClientSession} from '@/app/lib/auth';

/**
 * Session store for the admin pages (review, district comments, thumbnails)
 * and auth UI. Content editing moved to the Wagtail CMS; the legacy content
 * form state that used to live here was removed with it. The name is kept to
 * avoid churn in the consumers.
 */
export interface CmsFormStore {
  session: ClientSession | null;
  setSession: (session: CmsFormStore['session']) => void;
}

export const useCmsFormStore = create<CmsFormStore>(set => ({
  session: null,
  setSession: session => set({session}),
}));
