import {create} from 'zustand';

export type AssignmentIssues = {
  /** Document the check ran against; the modal only shows for this document. */
  documentId: string;
  /** Broken-up units that still have their own assignment row. */
  parentRows: string[];
  /** Broken-up unit -> blocks the backend says it contains that the map never saved. */
  missingBlocks: Map<string, string[]>;
  /** Assigned units with no population data that parentRows doesn't explain. */
  unmatched: string[];
  /** Broken-up units whose blocks couldn't be checked (no edges came back). */
  unverified: string[];
};

/**
 * How to resolve a unit saved both whole and as blocks: keep the blocks (drop the
 * whole-unit row), or use the whole unit (drop its blocks and un-break it).
 */
export type ParentRowChoice = 'blocks' | 'whole';

/** The row changes a repair applies, built from the issues and the user's choices. */
export type AssignmentRepairPlan = {
  /** Broken-up units to make whole again: their blocks' rows are dropped. */
  keepWhole: string[];
  /** Rows dropped outright: whole-unit rows whose blocks are kept, and unmatched ids. */
  dropRows: string[];
  /** Broken-up unit -> blocks to add back, taking the unit's own assignment if it has one. */
  addBlocks: Map<string, string[]>;
};

export const useAssignmentRepairStore = create<{
  issues: AssignmentIssues | null;
  open: boolean;
  /** Document whose load-time prompt was waved off; save and manual checks still open. */
  dismissedFor: string | null;
  /** The user's pick per entry in issues.parentRows. */
  choices: Record<string, ParentRowChoice>;
}>(() => ({issues: null, open: false, dismissedFor: null, choices: {}}));
