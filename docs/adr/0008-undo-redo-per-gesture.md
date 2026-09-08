# 8. Undo/redo per gesture

Date: 2026-07 (PR #634; regression fix `07af68f6`)

## Status

Accepted

## Context

Undo snapshots moved from a 3-second throttle to one entry per gesture. That exposed a bug the throttle had masked: the auto-heal that can follow a paint bumped `clientLastUpdated` milliseconds after the gesture's own ingest, producing two history entries.

## Decision

Suppress undo tracking around the heal's `set()` call so healing folds into the gesture that triggered it.

## Consequences

The standing rule: any new automatic post-paint side effect folds into the triggering gesture's undo entry, not a new one.
