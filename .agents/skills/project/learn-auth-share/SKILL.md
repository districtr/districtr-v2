---
name: learn-auth-share
description: Auth0 scopes, recaptcha verification, and share/edit token security patterns
user-invocable: false
---

# Auth & Share Security

Authentication/authorization and share-security behavior across Auth0 scopes, recaptcha verification, and map share/edit-access tokens.

## When To Use
- You are changing protected endpoints, scopes, or role behavior.
- You are changing admin login/session behavior in frontend.
- You are changing share-link or password-protected edit access behavior.

## Canonical Files
- `backend/app/core/security.py`
- `backend/app/core/dependencies.py`
- `backend/app/save_share/main.py`
- `backend/app/core/config.py`
- `app/src/app/lib/auth0.ts`
- `app/src/app/admin/layout.tsx`
- `app/src/app/hooks/useAuthRoutes.tsx`
- `app/src/app/store/saveShareStore.ts`

## Hard Invariants
- Protected backend routes must enforce required scopes via `auth.verify`.
- Auth0 token validation must preserve audience/issuer/algorithm constraints.
- Recaptcha-gated flows must verify token server-side.
- Share-token payload and password behavior must remain compatible with frontend share/edit flows.
- Public document access must not expose private document identifiers.

## Preferred Patterns
- Add scope requirements explicitly on routes rather than implicit role checks.
- Keep share/edit access flows using existing backend `save_share` endpoints.
- Use existing Auth0 client session wiring in admin pages.
- Keep secrets and key material in environment configuration only.

## Anti-Patterns
- Broadening scopes or bypassing route security checks for convenience.
- Performing recaptcha checks only in frontend.
- Logging sensitive token/password data.
- Returning internal IDs/secrets in public route responses.

## Change Checklist
1. Verify scope enforcement on all touched protected routes.
2. Verify token verification config (audience/issuer/algorithms) is unchanged or intentionally updated.
3. Verify recaptcha validation still runs for relevant form endpoints.
4. Verify share/password flow works for read/edit transitions.
5. Verify no sensitive data is exposed in logs/responses.

## Validation Commands
- `cd backend && pytest -v tests/test_save_share.py tests/test_comments.py`
- `cd app && bun run build`

## Common Failure Modes
- 401/403 regressions from missing scopes in frontend-acquired tokens.
- Broken admin pages from session/token wiring drift.
- Password-protected map edit failures due to token/payload mismatch.
- False recaptcha failures from env/config mistakes.
