# 42. Version-skew detection: build stamping and forced reload of stale tabs

Date: 2026-06-11 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

After the msgpack cutover for `PUT /api/assignments` (ADR 0040), users with tabs open from before the deploy hit a decode error on every save: the stale bundle sent JSON, whose first byte (`{` = 0x7b) decodes as the msgpack integer 123, leaving the rest of the body as unparseable "extra data" (PR #557). Wire-format changes had no mechanism to detect or recover from a client running old code against a new API contract.

## Decision

Stamp each frontend build with the deploying commit SHA (`NEXT_PUBLIC_BUILD_TAG`), inlined into the client bundle at build time. A `GET /api/version` route reports the running server's build tag (`no-store`, disabled entirely — returns `{version: null}` — in local dev). A `<VersionCheck />` component compares the bundle's inlined tag against this endpoint on mount, on tab visibility, on window focus, and every 5 minutes, and shows a non-dismissible reload dialog on mismatch.

## Consequences

Future deploys that change the wire format cannot silently strand old tabs — a mismatched tab is forced to reload before it can hit the new contract. This does not protect tabs that are already stale at the time this mechanism ships. The build tag only bumps when frontend code changes; an API contract change must touch both frontend and backend in one merge (as ADR 0040 did) for the version check to catch it.
