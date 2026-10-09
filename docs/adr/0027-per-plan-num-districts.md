# 27. num_districts: a per-plan override of the module value

Date: 2026-02-03 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

The number of districts in a plan was locked to the map module, fixed once a plan was created. This blocked a concrete need: Navajo Nation plans could require either 24 or 25 districts, which a static per-module value could not express (PR #476, migration `111fa461521c`).

## Decision

Add a nullable `num_districts` to the document that overrides the map module's value when set, with frontend controls to change it on maps that allow it (`districtrmap.num_districts_modifiable`).

## Consequences

A plan's district count can be changed after creation rather than being fixed at map-module creation time. Other map metadata controls that followed a static, module-level pattern (e.g. colors) were refactored in the same change to follow an on-save pattern instead.
