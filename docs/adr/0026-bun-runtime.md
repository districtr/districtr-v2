# 26. Bun as frontend runtime

Date: 2025-12-19 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Updating Next.js to its latest stable release (for a security fix and dev/perf improvements) was an opportunity to also address frontend runtime performance (PR #466).

## Decision

Swap the frontend runtime to Bun for better performance in both dev and production.

## Consequences

Frontend dev server startup and build times improve. The Next.js upgrade in the same PR required fixing subtle downstream changes (e.g. React's `findDomNode` deprecation).
