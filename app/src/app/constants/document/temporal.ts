/**
 * locally defined variable in the original codebase;
 * purpose is to only count drag select movements greater
 * than this threshold.
 * @type {number}
 */
export const OFFSET_FACTOR: number = 15;

/** Minimum milliseconds between undo/redo history snapshots. */
export const MIN_DIFF_MS = 3000;

/** Maximum number of undo/redo history states to keep per store. */
export const TEMPORAL_HISTORY_LIMIT = 20;
