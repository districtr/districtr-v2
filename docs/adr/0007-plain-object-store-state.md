# 7. Plain-object store state with a map-ref getter

Date: 2024-10-17 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Zustand state hit two edge cases (PR #125): React `MutableRef`s of an HTML element (such as the map instance) broke Redux DevTools observation, and `Set`/`Map` instances did not survive Zustand's serialization when a tab lost focus and its state went to sleep.

## Decision

Keep Zustand store state as plain, serializable objects — `Array`s and `Record`s (plain objects) instead of `Set`/`Map` — and hold the map instance behind a `getMapRef` function rather than a direct `mapRef` reference.

## Alternatives considered

- Swap to a more robust state library. Not pursued — the existing Zustand setup only needed a refactor, not a replacement.
- Hack Zustand in non-standard ways to support `Set`/`Map` serialization directly. Not pursued in favor of avoiding those types in store state altogether.

## Consequences

Store state stays serializable and observable in DevTools across tab sleep/wake. Code that previously used `.size`, `.get`, or other `Set`/`Map` methods on store state had to be updated to array/object equivalents.
