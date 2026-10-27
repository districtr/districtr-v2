# 21. Auth0 JWT with scopes for admin/CMS surfaces

Date: 2025-05-05 (recorded retrospectively 2026-09-08)

## Status

Superseded by [0055](0055-cms-identity-provider.md).

## Context

CMS and admin surfaces needed authentication and authorization distinct from the public editing flow (PR #327).

## Decision

Use Auth0-issued JWTs, carrying scopes, to authenticate and authorize admin and CMS surfaces.

## Consequences

Admin/CMS authorization is scope-based and delegated to Auth0 rather than a custom auth system, keeping user management and token issuance out of this codebase.
