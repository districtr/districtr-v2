# 2. Founding stack

Date: 2024-07-20 (PRs #1, #8; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Districtr v2 began as a rewrite of the v1 platform, seeded from the `districtr-sandbox` prototype. The founding commits fixed the shape everything since has grown inside.

## Decision

A monorepo with four parts: a Next.js frontend, a FastAPI backend, PostGIS as the database, and offline data pipelines (PR #1 set up the backend loading GerryDB tables; the frontend arrived from the sandbox). Two frontend choices came with the port and stand today: Zustand for state management (PR #8 reorganized the v1 dispatcher into Zustand stores) and PMTiles vector tiles rendered in the browser by MapLibre.

## Consequences

The monorepo boundary defines the deploy units (frontend, backend, pipelines as batch jobs) and the skill/ownership boundaries. Zustand and PMTiles each accumulated their own subsequent decisions ([0007](0007-plain-object-store-state.md), [0016](0016-central-store-subscriptions.md), [0008](0008-tiles-from-object-storage.md)). PR #8's refactor notes survive at `docs/refactor_notes/reducer_dispatch_notes.md`.
