import {create} from 'zustand';

/** What's wrong with a map's assignments, as found by findAssignmentIssues. */
export type FoundIssues = {
  /** Broken-up units that still have their own assignment. */
  parentAssignments: string[];
  /** Broken-up unit -> blocks the backend says it contains that the map never saved. */
  missingBlocks: Map<string, string[]>;
  /** Assigned units with no population data that parentAssignments doesn't explain. */
  unmatched: string[];
  /** Broken-up units whose blocks couldn't be checked (no edges came back). */
  unverified: string[];
};

export type AssignmentIssues = FoundIssues & {
  /** Document the check ran against; the modal only shows for this document. */
  documentId: string;
  /**
   * Each broken-up unit's blocks, fetched from the backend for the check. A unit's
   * blocks are fixed for a given map, so the repair re-checks against these
   * instead of fetching again.
   */
  blocksByParent: Map<string, string[]>;
};

/**
 * How to resolve a unit saved both whole and as blocks: keep the blocks (drop the
 * whole-unit assignment), or use the whole unit (drop its blocks and un-break it).
 */
export type ParentAssignmentChoice = 'blocks' | 'whole';

/** The assignment changes a repair applies, built from the issues and the user's choices. */
export type AssignmentRepairPlan = {
  /** Broken-up units to make whole again: their blocks' assignments are dropped. */
  keepWhole: string[];
  /** Assignments dropped outright: whole-unit ones whose blocks are kept, and unmatched ids. */
  dropAssignments: string[];
  /** Broken-up unit -> blocks to add back, taking the unit's own assignment if it has one. */
  addBlocks: Map<string, string[]>;
};

/**
 * What a store's applyAssignmentRepair did. When its re-check finds issues the user
 * hasn't seen, it applies nothing and hands back the current issues to show them.
 */
export type AssignmentRepairResult =
  | {applied: true}
  | {applied: false; current: FoundIssues; newIds: string[]};

export const useAssignmentRepairStore = create<{
  issues: AssignmentIssues | null;
  open: boolean;
  /** Document whose load-time prompt was waved off; save and manual checks still open. */
  dismissedFor: string | null;
  /** The user's pick per entry in issues.parentAssignments. */
  choices: Record<string, ParentAssignmentChoice>;
  /** Units a repair attempt found that the user hadn't seen; the modal marks them New. */
  newIds: string[];
}>(() => ({issues: null, open: false, dismissedFor: null, choices: {}, newIds: []}));
