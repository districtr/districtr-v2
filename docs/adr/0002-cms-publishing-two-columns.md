# 2. CMS publishing: two columns, no status enum

Date: 2025-04-08 (PR #306; comment review states PR #431, 2025-08-06; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

CMS content needs a draft/published lifecycle, and comments need review states. A status enum on content was the obvious alternative.

## Decision

`draft_content` and `published_content` are separate JSONB columns; publishing moves and clears. There is deliberately no "in review" state on content — review status belongs to comments.

## Consequences

Rejected comments are masked with a placeholder in public responses rather than omitted, keeping zone-scoped counts truthful for admins.
