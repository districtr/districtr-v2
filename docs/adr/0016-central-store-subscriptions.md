# 16. Cross-store side effects in central subscription modules

Date: 2025-03-08 (PR #283; anchor found by code archaeology — the PR body does not describe the subscription modules; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Choropleth mapping (PR #283) required frontend state and map rendering to react to changes across multiple Zustand stores (data store, map scale, interaction state), which needed a consistent place to wire cross-store reactions rather than scattering them across component event listeners.

## Decision

Wire cross-store side effects in central subscription modules, not in component-level listeners.

## Consequences

Side effects that span multiple stores stay discoverable in one place instead of being scattered across component code, at the cost of an extra layer of indirection between a store update and its effects.
