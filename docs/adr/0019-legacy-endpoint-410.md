# 19. 410 response convention for deprecated/legacy endpoints

Date: 2025-03-18 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Legacy demography requests against removed endpoints were producing raw errors for clients still hitting them (PR #310).

## Decision

Deprecated/legacy endpoints respond with HTTP 410 Gone rather than a generic error or a silent 404.

## Consequences

Clients calling a removed endpoint get a clear, semantically correct signal that the resource is permanently gone rather than transiently missing, which distinguishes deliberate removal from a bug.
