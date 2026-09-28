# 27. num_districts moves from static per-module to mutable per-plan

Date: 2026-02-03 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The number of districts in a plan was locked to the map module, fixed once a plan was created. This blocked a concrete need: Navajo Nation plans could require either 24 or 25 districts, which a static per-module value could not express (PR #476, migration `111fa461521c`).

## Decision

Move `num_districts` from the map module to the document schema, so it is mutable per plan, with frontend controls to change it.

## Consequences

A plan's district count can be changed after creation rather than being fixed at map-module creation time. Other map metadata controls that followed a static, module-level pattern (e.g. colors) were refactored in the same change to follow an on-save pattern instead.
