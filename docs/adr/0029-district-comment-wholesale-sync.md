# 29. District-comment sync replaces a district's comments wholesale

Date: 2026-02-23 (PR #489; semantics found at code level, not stated in the PR body; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

District-level comments (PR #489) let users add and view comments per district from the map or the population panel, without moderation. Syncing edits made to a district's comments needed a defined update semantics.

## Decision

Syncing a district's comments replaces the full set for that district wholesale rather than merging individual comment changes.

## Consequences

Comment sync stays simple — no per-comment merge or conflict logic — at the cost that two clients editing the same district's comments concurrently will have one overwrite the other rather than merge.
