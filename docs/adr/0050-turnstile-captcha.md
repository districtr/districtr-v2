# 50. Turnstile for public writes, two widgets with per-widget secrets

Date: 2026-07-30 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

Captcha protection on public writes originated as reCAPTCHA v2 on the comment form (PR #432) and was extended to reCAPTCHA v3 for silent session minting (ADR 0049, PR #619).

## Decision

Replace both reCAPTCHA flows with Cloudflare Turnstile, using two separate widgets that mirror the prior setup: a Managed widget for the comment form (tokens are single-use; the widget resets when the store clears the token after submit), and a Managed widget with `appearance: interaction-only` for silent session minting (silent for trusted browsers, but surfaces a manual challenge when Cloudflare requires interaction, rather than silently failing to mint a session). The backend verifies both against Cloudflare's `siteverify` endpoint through two thin wrappers, one per widget secret — Turnstile has no score, so the v3 score threshold and action check are dropped; per-widget secrets already prevent cross-widget token replay. The `recaptcha_token` wire field name (and the `*WithRecaptcha` model names mirroring it) are deliberately kept even though they now carry Turnstile tokens, to avoid churning every client and test for no behavior change.

## Consequences

Comment-form and session-minting captcha share one verification pattern (`siteverify` + per-widget secret) instead of two different reCAPTCHA product generations. Browser tabs holding the old bundle at cutover fail captcha (sending Google tokens to Turnstile verification) until reload; already-minted session JWTs keep working since HMAC signing and TTL are unchanged. The `recaptcha_token` naming is now a naming mismatch against its actual contents — kept deliberately rather than fixed.
