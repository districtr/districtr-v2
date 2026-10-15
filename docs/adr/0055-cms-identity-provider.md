# 55. The CMS issues every RS256 access token the backend accepts; the backend verifies any JWKS-published token by scope

Date: 2026-09-23 (PRs #711, #714, #718; recorded retrospectively 2026-09-28)

## Status

Accepted. Supersedes [0021](0021-auth0-scopes.md). Amends [0049](0049-waf-session-tokens.md).

## Context

Admin and CMS surfaces authenticated with Auth0-issued JWTs carrying scopes ([0021](0021-auth0-scopes.md)), verified by an Auth0-specific backend verifier that also let client-credentials tokens (`gty=client-credentials`) skip scope checks. With the Wagtail CMS ([0054](0054-wagtail-cms-service.md)) holding users and roles itself, a second identity system only duplicated them. PR #711 decoupled the verifier first — "The verifier no longer knows what an Auth0 is" — so the cutover itself became "a three-string config change"; PR #718 then removed Auth0, landing frontend and backend together because "splitting them opens a window where nobody can log in."

## Decision

The CMS issues every RS256 access token the backend accepts (the backend still mints its own HS256 session and share tokens, [0049](0049-waf-session-tokens.md)). It signs RS256 JWTs (SimpleJWT, `cms/config/settings/base.py`) with a `kid` header set to the key's RFC 7638 thumbprint, and publishes its public keys at `/.well-known/jwks.json`; during rotation `JWT_NEXT_VERIFYING_KEY` is served alongside the active key. There are no login or refresh endpoints and no refresh tokens. Humans sign in to the Wagtail admin with Django sessions, and the CMS mints short-lived access tokens in-process only when it calls the backend:

- `mint_user_access_token(user)` — 5 minutes, carrying the user's scopes and claims ([0057](0057-roles-team-scoped-moderation.md)), for calls made on a user's behalf.
- `mint_service_token(name, scopes)` — 15 minutes, subject `service:<name>`, for data-admin operations; `manage.py issue_service_token` mints one for scripts outside the CMS's own calls.

The backend verifier (`backend/app/core/security.py::VerifyToken`, PyJWT's `PyJWKClient`) knows no provider: it resolves the key by `kid` from `AUTH_JWKS_URL`, checks signature, `AUTH_AUDIENCE`, `AUTH_ISSUER`, and expiry, and requires every scope an endpoint declares (`Security(auth.verify, scopes=[...])`) in the space-separated `scope` claim. Machine tokens get no scope bypass.

## Consequences

User management moves into this codebase (`provision_users`; `migrate_tiptap --owners` keeps imported pages editable by their Auth0-era authors). Claims are re-derived on every mint, so a role change takes effect on the user's next action. Scope strings are duplicated by hand in `cms/authapi/scopes.py` and the backend's `TokenScope` and must match exactly; the cross-service contract is pinned from both sides (`backend/tests/test_auth_contract.py`, `cms/authapi/tests.py`). `KidTokenBackend` copies SimpleJWT internals, so it needs a re-check on any SimpleJWT upgrade. A scoped CMS token can also be exchanged for a [0049](0049-waf-session-tokens.md) session token at `POST /api/session/admin`, standing in for the Turnstile check on server-side calls that cannot solve one.
