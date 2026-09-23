# 30. E2E testing via Playwright, local/dev-only

Date: 2026-03-13 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The project had no end-to-end test coverage exercising the full stack (PR #488). Running the database, API, frontend, and a test runner together in CI is heavy.

## Decision

Add Playwright scaffolding for end-to-end tests, deliberately scoped to local and dev use rather than running in CI.

## Alternatives considered

- Run the Playwright suite in CI. Explicitly rejected as a non-goal for this PR — running DB, API, FE, and test runner together in GitHub Actions was judged too heavy.

## Consequences

E2E tests exist and can be run locally or in dev, but do not gate CI, so a merge can land without the E2E suite having run.
