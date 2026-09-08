# 14. react-map-gl as the MapLibre integration layer

Date: 2025-02-24 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The existing imperative MapLibre integration made complex layer mounting and unmounting hard to manage as the map grew more layers and interaction modes (PR #279).

## Decision

Refactor the map integration onto react-map-gl, giving layer mount/unmount a component-managed API instead of imperative MapLibre calls, while keeping the existing `mapRef` API compatible where possible.

## Alternatives considered

- Continue with direct imperative MapLibre calls. Rejected — component lifecycle for layers becomes hard to reason about as layer count grows.

## Consequences

Layer components can rely on React's mount/unmount lifecycle instead of manual imperative setup/teardown. This became the standard integration layer for later map rendering work, including the split into per-scope layer components (ADR 0028).
