# 7. Assignments tables departitioned

Date: 2026-07-16 (PR #625)

## Status

Accepted

## Context

`document.assignments` and `document.community_assignments` had been LIST-partitioned per document: every document creation ran `CREATE TABLE ... PARTITION OF ...`, taking an ACCESS EXCLUSIVE lock on the parent table. Under stress-test load (12,750 simulated users) this convoyed every assignment read/write behind document creations — ~93% request failure with app and DB CPU both idle, lock waits confirmed in RDS Performance Insights.

## Decision

Migration `7e57b49573e0` converted both to plain tables; document creation now does no DDL. A HASH-partitioning alternative was measured and rejected: the composite-PK lookup was ~4ms of a ~115ms query, so partitioning the cheap part bought nothing.

## Consequences

The migration is deliberately irreversible (downgrade raises; rollback is a DB snapshot) — documented in its own docstring, the worked example of stating that tradeoff. Repartitioning these tables would reintroduce the convoy.
