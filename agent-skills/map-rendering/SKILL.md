---
name: map-rendering
description: Changing what the interactive map shows or how painting, shattering, or map interaction behaves — MapLibre rendering, feature-state, Zustand map stores, undo/redo, and the geometry/parquet Web Workers.
user-invocable: false
---

# Map Rendering & Interaction

## Constraints

- **The map must feel synchronous under continuous mouse movement.** This is the value
  the rendering design serves; its consequences:
  - Heavy geometry/tabular work (dissolve/centroid math, parquet range scans) runs in
    `GeometryWorker`/`ParquetWorker`, never on the `mousemove`-driven paint path.
  - The paint path writes MapLibre feature-state directly and synchronously from the
    store action (see the comment at `assignmentsStore.ts`'s paint path) — do not
    marshal paint updates through an async layer re-render.
  - A gesture coalesces to **one undo entry**: assignments buffer in
    `accumulatedAssignments` and ingest once at gesture end. Any *automatic* post-paint
    side effect (e.g. auto-heal) must fold into the triggering gesture's undo entry,
    not open its own — commit `07af68f6` fixed exactly this regression after PR #634
    made undo per-gesture (detail in `docs/decisions.md`).

## Vocabulary at this surface

- **Shatter / Break / Block Mode / Super Draw are one feature**: code says `shatter`
  (`ACTIVE_TOOLS.SHATTER`, ~45 files); the toolbar label is "Break"; user copy says
  "break down into blocks"; the pill component is `BlockModePill`; the tool is gated
  behind "Super Draw" mode. Grepping the UI word "break" misses the implementation.

## Where the rest lives

- Rendering architecture narrative (stores → subscribers → MapLibre, layer stack,
  worker contracts, event flow): `docs/overview.md`.
- Layer-separation and undo history: `docs/decisions.md`.
