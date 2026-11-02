# 4. Sentry for error monitoring

Date: 2024-07-18 (backend, commit c98ba20c; frontend PR #51, 2024-08-18; recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

The frontend had no error monitoring in production, making it hard to notice and diagnose client-side failures after deploy. PR #51 gives no rationale; this context is inferred (auto-deploy on merge to `main` is issue #50, a separate change).

## Decision

Use Sentry for error monitoring, set up via the Sentry wizard (PR #51).

## Consequences

Client-side errors are captured and visible without waiting for user reports. Monitoring config ships with the frontend's own deploy, so coverage tracks the deployed frontend.
