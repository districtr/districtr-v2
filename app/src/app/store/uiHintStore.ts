import {create} from 'zustand';

export type ValidationTab = 'Contiguity' | 'Completeness';
export type SummaryTabRequest = {panel: 'demography' | 'election'; tab: 'evaluation' | 'map'};

/** Per-document localStorage keys backing the "Improve your plan" done states
 * that can't be derived from live UI state (panels reset on view switches;
 * evaluation is a different route entirely). Written by the panels/switcher,
 * read by GettingStarted; a neutral home avoids component import cycles. */
export const visitedEvalStorageKey = (documentId: string) => `districtr-visited-eval-${documentId}`;
export const viewedTablesStorageKey = (documentId: string) =>
  `districtr-viewed-tables-${documentId}`;

// Carries one-shot "scent" intents from the Getting Started checklist to the
// controls they point at: open a validity-check tab, auto-expand broken
// districts, and briefly flash the target control.
interface UiHintStore {
  /** Consumed (and cleared) by MapValidation to switch its active tab. */
  validationTabRequest: ValidationTab | null;
  requestValidationTab: (tab: ValidationTab) => void;
  clearValidationTabRequest: () => void;
  /** Consumed (and cleared) by the matching TabbedSummaryPanel to switch its
   * Table / Map Layer tab. */
  summaryTabRequest: SummaryTabRequest | null;
  requestSummaryTab: (request: SummaryTabRequest) => void;
  clearSummaryTabRequest: () => void;
  /** Timestamp of the last "find disconnected fragments" click; ContiguityDetail
   * auto-expands discontiguous districts that mount shortly after. */
  expandDiscontiguousAt: number;
  pingExpandDiscontiguous: () => void;
  /** Timestamp ping that opens the Visual settings popover. */
  visualSettingsOpenAt: number;
  pingVisualSettingsOpen: () => void;
  /** Briefly highlights the control with the matching flash id. */
  flashTarget: string | null;
  flash: (target: string) => void;
}

const FLASH_DURATION_MS = 1600;

export const useUiHintStore = create<UiHintStore>(set => ({
  validationTabRequest: null,
  requestValidationTab: tab => set({validationTabRequest: tab}),
  clearValidationTabRequest: () => set({validationTabRequest: null}),
  summaryTabRequest: null,
  requestSummaryTab: request => set({summaryTabRequest: request}),
  clearSummaryTabRequest: () => set({summaryTabRequest: null}),
  expandDiscontiguousAt: 0,
  pingExpandDiscontiguous: () => set({expandDiscontiguousAt: Date.now()}),
  visualSettingsOpenAt: 0,
  pingVisualSettingsOpen: () => set({visualSettingsOpenAt: Date.now()}),
  flashTarget: null,
  flash: target => {
    set({flashTarget: target});
    setTimeout(
      () => set(state => (state.flashTarget === target ? {flashTarget: null} : state)),
      FLASH_DURATION_MS
    );
  },
}));
