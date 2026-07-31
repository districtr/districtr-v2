import {create} from 'zustand';
import type {WorkflowTabKey} from '@components/sidebar/DataCards';

/** One-shot cross-component UI requests: a panel elsewhere in the app asks the
 * sidebar to jump to a tab (e.g. "Find unassigned" → Stats). The consumer
 * clears the request after honoring it. */
interface UiHintStore {
  sidebarTabRequest: WorkflowTabKey | null;
  requestSidebarTab: (tab: WorkflowTabKey) => void;
  clearSidebarTabRequest: () => void;
}

export const useUiHintStore = create<UiHintStore>(set => ({
  sidebarTabRequest: null,
  requestSidebarTab: tab => set({sidebarTabRequest: tab}),
  clearSidebarTabRequest: () => set({sidebarTabRequest: null}),
}));
