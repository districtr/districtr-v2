# 1. Record architecture decisions

Date: 2026-09-08

## Status

Accepted

## Context

Why the system is shaped the way it is has been recorded twice before, and neither habit stuck: a single dated history file (`docs/decisions.md`), and — for a brief period around v2.2.2 — per-PR "📐 ADR" blocks in the release devlog ([discussion #537](https://github.com/districtr/districtr-v2/discussions/537)). A single file has no per-decision status and cannot mark one decision superseded without editing history; devlog blocks are invisible from the repo.

## Decision

Architectural decisions are recorded as Architecture Decision Records: one file per decision under `docs/adr/`, in the format described by Michael Nygard — Date, Status, Context, Decision, Consequences, plus Alternatives considered and Revisit when where the evidence supports them. Files are numbered in decision order (`NNNN-slug.md`), dated by the earliest PR evidencing the decision, and PR-anchored so every claim can be re-verified. A decision that reverses an earlier one gets a new ADR and marks the old one Superseded rather than rewriting it. Decisions already superseded at adoption time are not back-filled — a superseded predecessor appears only in its successor's Context.

## Consequences

`docs/decisions.md` and the devlog ADR blocks dissolve into the records here; ADRs 2 onward reconstruct the standing decisions retrospectively from PR history, the migration chain, and git archaeology. New decisions add a numbered file and a line in [`README.md`](README.md). Records written retrospectively say so next to their date. In ADR prose, districts are called "districts" — the code's `zone` column is named only when citing a concrete schema anchor.
