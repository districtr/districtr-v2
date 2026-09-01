---
name: learn-auth-share
description: Authentication, authorization, and share links in the backend and frontend — Auth0 scopes and admin roles, Cloudflare Turnstile captcha verification, share-link and password-protected edit-access tokens, and the public id vs private document_id boundary (get_document_public). Use when adding or changing a protected endpoint, admin role, share link, edit access, or any server-side check on a request before trusting it.
user-invocable: false
---

# Auth & Share Security

## Invariants

- **Every protected backend route enforces scopes through `VerifyToken.verify`
  (`backend/app/core/security.py`), not an ad hoc role check.** `SecurityScopes` from the
  route's own dependency declaration is compared against the JWT's `scope` claim; a
  request with a valid-but-under-scoped token gets 403 (`UnauthorizedException`), not a
  silently narrowed response. The one exception is `gty == "client-credentials"` tokens
  (machine-to-machine), which skip the scope check entirely — that's a Auth0 grant-type
  distinction, not a bypass someone can trigger.
- **Turnstile verification happens server-side, always** — `_turnstile_siteverify` posts
  the token to Cloudflare's `siteverify` endpoint from the backend. A frontend-only check
  would trust the client to grade its own captcha.
- **The comment-form Turnstile secret and the session Turnstile secret are different
  keys** (`TURNSTILE_SECRET_KEY` vs. `TURNSTILE_SESSION_SECRET_KEY`) — a token minted for
  one widget can't be replayed against the other's verification call.
- **Share tokens and session tokens are both HMAC JWTs signed with the same
  `SECRET_KEY`, distinguished only by an `aud` claim.** Session tokens carry
  `aud: "districtr:session"` (`SESSION_AUDIENCE` in `security.py`) and an expiry; share
  tokens (minted in `save_share/main.py`) carry neither. A change to either minting path
  that starts adding `aud`/`exp` to share tokens, or drops `require_session`'s
  `options={"require": ["exp", "aud"]}`, breaks this separation.
- **Public document access must never return the true `document_id`.** A document is
  reachable by its private `document_id` (UUID; possession grants edit rights) or its
  `public_id` (small integer; read-only). The request dependencies in
  `backend/app/core/dependencies.py` enforce the boundary, and the choice among them is
  the same rule `learn-backend` states — repeated here because share-link work lands on
  it directly: `get_protected_document` returns the raw `Document` row, every column
  included — safe to read from inside a handler, unsafe to return, since a `public_id`
  caller would get the real `document_id` back along with everything else.
  `get_document_public` exists for routes that do need to return document data: it
  assembles the response field by field and substitutes a masked placeholder for
  `document_id` whenever the caller only supplied the public id. Pick the dependency by
  what the handler returns, not what it reads — a response that grows to include
  document fields needs a switch to `get_document_public`, not a wider response.
  (`get_document` is the third option: private id only, for write paths.)

## The share/edit token model

`POST /api/document/{id}/share` (`backend/app/save_share/main.py`) mints (or reuses) a
row in `document.map_document_token`, keyed by `document_id`, optionally carrying a
bcrypt password hash. The JWT it returns wraps `{token: token_id, access: access_type,
password_required: bool}` — the token payload names *which* share record it refers to,
not the document directly; the actual access grant is looked up server-side by
`token_id` when the link is used.

Password-protected edit access (`POST /api/document/{id}/edit_access`) is a separate
step: given the plaintext password, the endpoint verifies it against the stored bcrypt
hash and, on success, returns the *protected* document (via `get_protected_document`) —
this is the one deliberate point where the true document is handed to whoever proves
they hold the password, turning a read-only share link into edit access. A wrong
password gets a flat 401, with no signal distinguishing "wrong password" from "no
password set" beyond what the initial share response already revealed via
`password_required`.

## Auth0 roles and scopes (frontend)

`app/src/app/lib/auth0.ts` maps three roles — `default`, `editor`, `admin` (reviewer
exists as a fourth scope string but isn't wired into `getUserRole` as of 2026-08-27) — to
literal OAuth scope strings (`SCOPES` in that file). `getUserRole` reads `user.roles`
from the Auth0 session claims; `getScopesForUser` returns the matching scope string,
which becomes the `scope` requested when the client acquires a token. The backend's
`TokenScope` class (`security.py`) is the mirror of these same scope strings on the
verification side — a scope added to one without the other is a change that compiles
but does nothing (frontend requests a scope the backend never checks, or the backend
requires a scope the frontend never asks Auth0 for).

## Territory

- `backend/app/core/security.py` — `VerifyToken`, `TokenScope`, Turnstile verification,
  session-token minting (`mint_session_token`) and enforcement (`require_session`).
- `backend/app/core/dependencies.py` — `get_document`, `get_protected_document`,
  `get_document_public`: the public/private ID boundary these auth checks sit in front of.
- `backend/app/save_share/main.py`, `save_share/models.py` — share-token minting and
  password-protected edit-access grant.
- `backend/app/core/config.py` — `AUTH0_DOMAIN`, `AUTH0_API_AUDIENCE`, `AUTH0_ISSUER`,
  `AUTH0_ALGORITHMS`, `SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SESSION_SECRET_KEY`.
- `app/src/app/lib/auth0.ts` — role→scope mapping, `Auth0Client` setup.
- `app/src/app/admin/layout.tsx`, `app/src/app/hooks/useAuthRoutes.tsx` — admin-side
  session wiring.
- `app/src/app/store/saveShareStore.ts` — frontend share/edit-access flow state.
- `app/src/app/hooks/useTurnstile.tsx`, `app/src/app/utils/turnstile.ts` — frontend
  Turnstile widget integration.

## See also

- `learn-backend` — the same dependency rule in its endpoint/data-model context, plus
  the rest of the backend conventions.
- `learn-cms` — role-scoped CMS read/write/publish behavior built on the scopes here.
