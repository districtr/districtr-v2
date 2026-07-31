import {create} from 'zustand';
import type {WorkflowTabKey} from '@components/sidebar/WorkflowTabs';

/** One-shot request for the sidebar to jump to a tab (e.g. "Find unassigned"
 * → Stats). Honored only while the workflow tabs are mounted; requests from
 * the stacked layout or eval view are discarded at the next mount, so callers
 * there must switch layouts first. */
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
