import {create} from 'zustand';
import type {WorkflowTabKey} from '@components/sidebar/WorkflowTabs';

export type ValidationTab = 'Contiguity' | 'Completeness';

/** One-shot cross-component UI requests, mostly issued by the draft-status
 * helper box. Each key is consumed (and cleared) by one component: sidebarTab
 * by WorkflowTabs, validationTab by MapValidation, shareModal by
 * MapActionsDropdown, modeMenu by ModeSwitcher (opens the dropdown without
 * changing modes). A request is honored only if its consumer is mounted when
 * it arrives — stale requests are discarded at the consumer's next mount
 * rather than firing late, so callers that need one from another context
 * (stacked layout, eval view) must switch there first. */
type UiHintRequests = {
  sidebarTab: WorkflowTabKey;
  validationTab: ValidationTab;
  shareModal: true;
  modeMenu: true;
};

const FLASH_DURATION_MS = 3000;

interface UiHintStore {
  requests: Partial<UiHintRequests>;
  request: <K extends keyof UiHintRequests>(key: K, value: UiHintRequests[K]) => void;
  clear: (key: keyof UiHintRequests) => void;
  /** Element to pulse-highlight (`.ui-flash`): a helper hint just pointed the
   * user at it. `section:<tabSectionId>` targets sidebar sections; other ids
   * are component-specific. Self-clears. */
  flashTarget: string | null;
  flash: (id: string) => void;
}

export const useUiHintStore = create<UiHintStore>((set, get) => ({
  requests: {},
  request: (key, value) => set(state => ({requests: {...state.requests, [key]: value}})),
  clear: key =>
    set(state => {
      const {[key]: _cleared, ...rest} = state.requests;
      return {requests: rest};
    }),
  flashTarget: null,
  flash: id => {
    set({flashTarget: id});
    setTimeout(() => {
      if (get().flashTarget === id) set({flashTarget: null});
    }, FLASH_DURATION_MS);
  },
}));
