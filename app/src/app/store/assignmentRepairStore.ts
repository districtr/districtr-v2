import {create} from 'zustand';

/** What's wrong with a map's assignments, as found by findAssignmentIssues. */
export type FoundIssues = {
  /** Shattered parents that still have their own assignment. */
  parentAssignments: string[];
  /** Shattered parent -> blocks the backend lists for it that the map never saved. */
  missingBlocks: Map<string, string[]>;
  /** Assigned ids with no demography row, other than shattered parents. */
  unmatched: string[];
  /** Shattered parents whose blocks couldn't be checked (no edges came back). */
  unverified: string[];
};

export type AssignmentIssues = FoundIssues & {
  /** Document the check ran against; the modal only shows for this document. */
  documentId: string;
  /**
   * Each shattered parent's blocks, fetched for the check. A parent's blocks are
   * fixed for a map, so the repair re-checks against these instead of refetching.
   */
  blocksByParent: Map<string, string[]>;
};

/**
 * Fix for a parent saved both whole and as blocks: keep the blocks (drop the parent's
 * own assignment), or keep the whole parent (drop its blocks and un-shatter it).
 */
export type ParentAssignmentChoice = 'blocks' | 'whole';

/** The assignment changes a repair applies, built from the issues and the user's choices. */
export type AssignmentRepairPlan = {
  /** Shattered parents to make whole again; their blocks' assignments are dropped. */
  keepWhole: string[];
  /** Assignments dropped outright: parents whose blocks are kept, and unmatched ids. */
  dropAssignments: string[];
  /** Shattered parent -> blocks to add back, with the parent's own assignment if it has one. */
  addBlocks: Map<string, string[]>;
};

/**
 * What a store's applyAssignmentRepair did. It applies nothing while demography lags a
 * shatter or heal ('loading'), or when its re-check finds issues the user hasn't seen
 * ('changed', with the current issues to show).
 */
export type AssignmentRepairResult =
  | {applied: true}
  | {applied: false; reason: 'loading'}
  | {applied: false; reason: 'changed'; current: FoundIssues; newIds: string[]};

export const useAssignmentRepairStore = create<{
  issues: AssignmentIssues | null;
  open: boolean;
  /**
   * Document where the user chose "Not now". Load and autosave checks then stay quiet;
   * explicit saves and manual checks still open the modal.
   */
  dismissedFor: string | null;
  /** The user's pick per entry in issues.parentAssignments. */
  choices: Record<string, ParentAssignmentChoice>;
  /** Ids a repair attempt found that the user hadn't seen; the modal marks them New. */
  newIds: string[];
  /** A repair was refused because demography was still loading. */
  populationUpdating: boolean;
}>(() => ({
  issues: null,
  open: false,
  dismissedFor: null,
  choices: {},
  newIds: [],
  populationUpdating: false,
}));
