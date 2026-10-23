# 48. Undo/redo per gesture, not time-throttled

Date: 2026-07-21 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

The undo/redo system's 3-second `MIN_DIFF_MS` throttle was meant to merge rapid edits into one undo step, but instead it silently stored no snapshot at all for any edit within 3 seconds of the previous one — a burst of clicks became un-undoable individually and could even swallow the pre-shatter snapshot (PR #634). Separately, undo did not persist to IndexedDB: `undo()`/`redo()` restored a snapshot in memory but never wrote IndexedDB, so a refresh compared `clientLastUpdated` to `updated_at`, found no difference, and silently discarded the undo by loading the server copy instead; and a successful cloud save fired `temporalDiff`, pushing a spurious snapshot onto the undo stack and clearing the redo stack (PR #597, fixing #517).

## Decision

Drop the time-based throttle. Every paint gesture already funnels through exactly one `ingestAccumulatedAssignments` `set()` call, so snapshot once per tracked-collection ref change instead of once per elapsed-time window — since all mutation paths replace Maps/Sets wholesale, ref inequality is a reliable O(keys) check for "did this gesture actually change anything." User edits and save syncs that only bump a timestamp do not create a new undo step under this rule. Wrap `undo`/`redo` to immediately write IndexedDB with a fresh timestamp so the browser's local-edit detection sees the undo as a real edit, and pause both temporal stores around `setClientLastUpdated` during a cloud save so the save's own timestamp bump cannot push a spurious entry onto the stack.

## Consequences

One undo step corresponds to one user gesture (click or stroke), not to a time window — bursts of rapid edits are individually undoable, and pre-shatter state is not silently lost. Undo/redo state now survives a page refresh. A cloud save can no longer corrupt the undo/redo stack. Dropping the throttle exposed one automatic post-paint effect that does replace collections: the auto-heal that follows a paint or, for the district store, exiting block view bumped `clientLastUpdated` milliseconds after the gesture's own ingest and produced a second undo entry. The fix shipped inside PR #634 itself (its second commit, before the squash merge): it suppresses undo tracking around the heal's `set()` so the heal folds into the gesture that triggered it. The standing rule: any new automatic post-paint side effect folds into the triggering gesture's undo entry, not a new one.
