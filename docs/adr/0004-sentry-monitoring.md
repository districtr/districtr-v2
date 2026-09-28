# 4. Sentry for error monitoring

Date: 2024-07-18 (backend, commit c98ba20c; frontend PR #51, 2024-08-18; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The frontend had no error monitoring in production, making it hard to notice and diagnose client-side failures after deploy (PR #51).

## Decision

Use Sentry for error monitoring, set up via the Sentry wizard and deployed automatically on merge to main.

## Consequences

Client-side errors are captured and visible without waiting for user reports. Deployment of monitoring config is tied to the frontend's own deploy workflow, so monitoring coverage tracks the deployed frontend automatically.
