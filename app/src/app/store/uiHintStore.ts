import {create} from 'zustand';
import type {MapControlsStore} from '@store/mapControlsStore';

export type ValidationTab = 'Contiguity' | 'Completeness';

/** One-shot cross-component UI requests, issued by the draft-status helper
 * box. Each key is consumed (and cleared) by one component. A request is
 * honored only if its consumer is mounted when it arrives — stale requests
 * are discarded at the consumer's next mount rather than firing late, so
 * callers that need one from another context (stacked layout, eval view)
 * must switch there first. */
type UiHintRequests = {
  /** Below lg the sidebar is hidden; helper jumps open the matching
   * full-screen mobile panel instead. Consumed by MobileDataTabs. */
  mobileTab: MapControlsStore['sidebarPanels'][number];
};

const FLASH_DURATION_MS = 3000;
// Restart delay + sequence token: re-flashing the same target must clear it
// for a beat (so the CSS animation restarts) and invalidate the previous
// flash's clear timer.
const FLASH_RESTART_MS = 30;
let flashSeq = 0;

// An abandoned guide must not pulse its target forever; each step re-arms the
// clock so a slow walk through a multi-step guide isn't cut off mid-way.
const GUIDE_STEP_TIMEOUT_MS = 45000;
let guideSeq = 0;

interface UiHintStore {
  requests: Partial<UiHintRequests>;
  request: <K extends keyof UiHintRequests>(key: K, value: UiHintRequests[K]) => void;
  clear: (key: keyof UiHintRequests) => void;
  /** Element to pulse-highlight (`.ui-flash`): a helper hint just pointed the
   * user at it. `section:<tabSectionId>` targets sidebar sections; other ids
   * are component-specific. Self-clears. */
  flashTarget: string | null;
  flash: (id: string) => void;
  /** Guided sequences: an ordered list of highlight targets the user walks
   * through by clicking each one themselves — the guide points, it never
   * clicks on the user's behalf. The head of the list is the active target;
   * its host component marks itself `.ui-guide` and calls `advanceGuide` on
   * the user's own click, or immediately when the target is already satisfied
   * (the pointed-at tab already active, the section already open). Each step
   * self-expires so an abandoned guide can't pulse forever. */
  guideTargets: string[];
  startGuide: (targets: string[]) => void;
  /** Advance past `id` — a no-op unless `id` is the current head, so hosts
   * can call it unconditionally from their click handlers. */
  advanceGuide: (id: string) => void;
  cancelGuide: () => void;
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
    const seq = ++flashSeq;
    set({flashTarget: null});
    setTimeout(() => {
      if (seq === flashSeq) set({flashTarget: id});
    }, FLASH_RESTART_MS);
    setTimeout(() => {
      if (seq === flashSeq) set({flashTarget: null});
    }, FLASH_DURATION_MS);
  },
  guideTargets: [],
  startGuide: targets => {
    const seq = ++guideSeq;
    set({guideTargets: targets});
    setTimeout(() => {
      if (seq === guideSeq) set({guideTargets: []});
    }, GUIDE_STEP_TIMEOUT_MS);
  },
  advanceGuide: id => {
    if (get().guideTargets[0] !== id) return;
    const seq = ++guideSeq;
    set(state => ({guideTargets: state.guideTargets.slice(1)}));
    setTimeout(() => {
      if (seq === guideSeq) set({guideTargets: []});
    }, GUIDE_STEP_TIMEOUT_MS);
  },
  cancelGuide: () => {
    // Invalidate pending expiries so a later guide isn't cleared by them.
    ++guideSeq;
    set({guideTargets: []});
  },
}));
