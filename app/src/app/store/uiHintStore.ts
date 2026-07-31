import {create} from 'zustand';
import type {WorkflowTabKey} from '@components/sidebar/WorkflowTabs';

export type ValidationTab = 'Contiguity' | 'Completeness';

/** One-shot cross-component UI requests, mostly issued by the draft-status
 * helper box: jump the sidebar to a tab, select a validation panel, open the
 * share modal, or switch the view mode. Each is honored only if its consumer
 * is mounted when the request arrives — stale requests are discarded at the
 * consumer's next mount rather than firing late, so callers that need one from
 * another context (stacked layout, eval view) must switch there first. */
interface UiHintStore {
  sidebarTabRequest: WorkflowTabKey | null;
  requestSidebarTab: (tab: WorkflowTabKey) => void;
  clearSidebarTabRequest: () => void;
  validationTabRequest: ValidationTab | null;
  requestValidationTab: (tab: ValidationTab) => void;
  clearValidationTabRequest: () => void;
  shareModalRequest: boolean;
  requestShareModal: () => void;
  clearShareModalRequest: () => void;
  /** Open the topbar mode-switcher dropdown (without changing modes) so the
   * user can see the Super Draw / Evaluate options the helper pointed at. */
  modeMenuRequest: boolean;
  requestModeMenu: () => void;
  clearModeMenuRequest: () => void;
  /** Element to pulse-highlight (`.ui-flash`): a helper hint just pointed the
   * user at it. `section:<tabSectionId>` targets sidebar sections; other ids
   * are component-specific. Self-clears. */
  flashTarget: string | null;
  flash: (id: string) => void;
}

const FLASH_DURATION_MS = 3000;

export const useUiHintStore = create<UiHintStore>((set, get) => ({
  sidebarTabRequest: null,
  requestSidebarTab: tab => set({sidebarTabRequest: tab}),
  clearSidebarTabRequest: () => set({sidebarTabRequest: null}),
  validationTabRequest: null,
  requestValidationTab: tab => set({validationTabRequest: tab}),
  clearValidationTabRequest: () => set({validationTabRequest: null}),
  shareModalRequest: false,
  requestShareModal: () => set({shareModalRequest: true}),
  clearShareModalRequest: () => set({shareModalRequest: false}),
  modeMenuRequest: false,
  requestModeMenu: () => set({modeMenuRequest: true}),
  clearModeMenuRequest: () => set({modeMenuRequest: false}),
  flashTarget: null,
  flash: id => {
    set({flashTarget: id});
    setTimeout(() => {
      if (get().flashTarget === id) set({flashTarget: null});
    }, FLASH_DURATION_MS);
  },
}));
