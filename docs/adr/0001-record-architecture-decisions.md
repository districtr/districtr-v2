# 1. Record architecture decisions

Date: 2026-09-08

## Status

Accepted

## Context

Why the system is shaped the way it is was previously recorded in a single dated history file (`docs/decisions.md`). A single file has no per-decision status, cannot mark one decision as superseded without editing history, and grows without structure.

## Decision

We record architectural decisions as Architecture Decision Records (ADRs), one file per decision under `docs/adr/`, in the format described by Michael Nygard: Date, Status, Context, Decision, Consequences. Files are numbered in decision order (`NNNN-slug.md`). Each record is PR-anchored where possible so its claims can be re-verified. A decision that reverses an earlier one gets a new ADR and marks the old one Superseded rather than rewriting it.

## Consequences

`docs/decisions.md` is dissolved into the records here; ADRs 2–10 carry its entries, retrospectively. New decisions add a new numbered file and a line in [`README.md`](README.md). Records for decisions made before this convention carry their best-known decision date; where none was recorded, the record is dated by when it was written down.
