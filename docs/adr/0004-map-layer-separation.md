# 4. Map layer components separated

Date: 2026-02 (PR #492)

## Status

Accepted

## Context

A single monolithic `Map.tsx` carried all drawing logic for every map mode and layer scope.

## Decision

Split into `MapContainer` (shell), `MainMap`/`CoiMap` (mode shells), `MapLayerAnchors` (render-order anchors), and per-scope layer components.

## Consequences

A change that reintroduces cross-cutting drawing logic in one component is reversing this split.
