---
name: learn-auth-share
description: Who can do what — Auth0 scopes for CMS/admin roles, Cloudflare Turnstile captcha verification, and the share/edit-link token model for map documents. Use when changing protected endpoints, admin roles, share-link or password-protected edit access, or anything that verifies a request server-side before trusting it.
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
  one widget cannot be replayed against the other's verification call, because the two
  calls are checked against different secrets on Cloudflare's side.
- **Share tokens and session tokens are both HMAC JWTs signed with the same
  `SECRET_KEY`, distinguished only by an `aud` claim.** Session tokens carry
  `aud: "districtr:session"` (`SESSION_AUDIENCE` in `security.py`) and an expiry; share
  tokens (minted in `save_share/main.py`) carry neither — no audience claim, no
  expiration. `require_session`'s decode call explicitly requires `aud` and `exp` to be
  present (`options={"require": ["exp", "aud"]}`), which is what stops a share token
  (missing both) from ever validating as a session token, even though both are signed
  with the same key.
- **Public document access must never return the true `document_id`.** The
  public/private ID split (`learn-backend`'s `get_document` vs. `get_protected_document`)
  is the mechanism; a public-facing response that leaks `document_id` defeats it
  regardless of how the value got there.

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
- `backend/app/core/dependencies.py` — `get_document` / `get_protected_document`, the
  public/private ID boundary these auth checks sit in front of (see `learn-backend`).
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

- `learn-backend` — `get_document`/`get_protected_document` and the ID boundary this
  skill's auth checks guard.
- `learn-cms` — role-scoped CMS read/write/publish behavior built on the scopes here.
