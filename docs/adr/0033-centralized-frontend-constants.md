# 33. Centralized constants directory with domain subfolders

Date: 2026-04-24 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

String literal unions (`'brush'`, `'TOTPOP'`, `'default' | 'local' | 'community'`, `'loaded' | 'initializing' | ...`, etc.) were redeclared inline at two or more call sites across the frontend. This produced drift risk, no single source of truth, and made cross-cutting changes (e.g. adding a new map type) require grep-driven find-and-replace. The existing `constants/` directory was flat and had begun to mix concerns (PR #527).

## Decision

Centralize all multi-use string-literal constants and their derived types in `app/src/app/constants/`, organized into three domain subfolders: `map/` (MapLibre/map-rendering concerns — tools, map types/modes/routes, rendering states, geography, zone layers), `document/` (document lifecycle — draft status, access levels, temporal constants), and `demography/` (summary-statistics display — column sets, display mode, summary types).

## Alternatives considered

- Co-locate constants with their primary consumer module. Rejected — most of these values are consumed across multiple feature modules, so any "primary" home is arbitrary and reintroduces import cycles.

## Consequences

Single source of truth; type errors now catch typos at every call site. Domain subfolders give a clear home for new constants and reduce review friction ("where does this go?"). Refactors like adding a new map mode are now one-file changes. Imports become slightly more verbose. Some constants straddle domains (e.g. column sets touch both demography and document); the chosen home is a judgment call and may need to move.

## Revisit when

A fourth domain emerges that does not fit `map/`, `document/`, or `demography/`; or backend schemas start defining values that overlap with these unions (consider codegen at that point).
