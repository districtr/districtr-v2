# 13. Zundo for undo/redo

Date: 2025-01-03 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The editor needed undo/redo without a large custom implementation, and the complexity was in handling shatter ("break") and heal operations elegantly, without intermediate states, while keeping the changes sent to the backend correct (PR #221).

## Decision

Use Zundo, an undo/redo middleware for Zustand, as the undo/redo mechanism, with dedicated silent-heal and silent-break handlers so shatter/heal operations do not create spurious intermediate undo states.

## Consequences

Undo/redo is implemented as a small addition on top of the existing Zustand store rather than a bespoke history system. Later refinement of undo/redo semantics (per-gesture snapshotting, sync interaction) builds on this Zundo foundation — see ADR 0048.
