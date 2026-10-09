# 7. Map instance behind a getter; `Set`/`Map` stay in store state

Date: 2024-10-17 (PR #125; DevTools serializer PR #170, 2024-12-03; recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

PR #125 reported two problems with Zustand store state:

- The store held the MapLibre map instance itself (`MapStore['mapRef']`), and that broke Redux DevTools, the browser extension used in development to inspect stores. DevTools converts the whole store to JSON text after every state change; the map is a large object with internal cycles, and converting it throws, which failed the conversion for the entire store.
- When a tab or window lost focus, "the state serializes and goes to sleep", and the district assignments and shatter lookups, kept as JavaScript `Map` and `Set` objects, did not survive it. JSON has no representation for these types: converting a `Map` or `Set` to JSON produces an empty object, so their contents are lost on the way back. The PR framed this as a runtime problem, not a tooling one.

The reconstruction could not find the production mechanism behind the second report. The only code that wrote store state to storage at the time, the `persist` middleware to localStorage (PR #127), saved one plain field, and the only thing that serialized the whole store was DevTools, which is enabled in development only. Whether the loss ever reached users is unverified; the hazard itself is real at any place that converts store state to JSON text.

## Decision

Two accommodations, one per problem:

- **The map instance leaves the store.** The store holds a function, `getMapRef`, that returns the live map (`() => mapRef.current?.getMap()` in `mapStore.ts`). JSON conversion skips functions, so the map is never serialized, and code that needs the map calls the function.
- **`Map` and `Set` stay in the store; the places that convert state to JSON handle them.** The store keeps these types for `zoneAssignments`, `parentToChild`, `childToParent`, `shatterIds` and the other collections in `assignmentsStore.ts`. The DevTools wrapper is configured to write each `Set` as an array and each `Map` as a plain object (`devToolsConfig.serialize.options` in `store/middlewareConfig.ts`, PR #170). The localStorage slice still saves one plain field (`userID`) and never contains them. The plan draft in IndexedDB and the server sync do not use JSON; both flatten the collections into assignment rows through `formatAssignmentsFromState` for their own reasons (ADR [0025](0025-save-sync-model.md)).

## Alternatives considered

- Swap to a more robust state library. Not pursued — the existing Zustand setup only needed a refactor, not a replacement.
- Replace `Set`/`Map` in store state with arrays and plain objects, so that no conversion step is ever needed. PR #125 set out to do this and struck it off its own checklist before merge; the conversion was never carried out.
- Hack Zustand in non-standard ways to support `Set`/`Map` serialization. Listed as the third option in PR #125, and in effect taken for DevTools by PR #170's serializer configuration.

## Consequences

The map instance stays out of store state, so DevTools can show the rest of the store. Store collections keep `Map`/`Set` semantics (`.get`, `.has`, `.size`, automatic de-duplication), and every mutation path replaces them wholesale, which is what lets the per-gesture undo diff of ADR [0048](0048-undo-redo-per-gesture.md) use reference equality as its change check. Any new place that converts store state to JSON text, such as a new persisted slice or an export, has to convert these collections itself; nothing in the store does it automatically.
