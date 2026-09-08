# 49. Edge protection: WAF plus stateless session tokens

Date: 2026-07-22 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

A full security audit of the API surface and AWS stack (PR #619) found no edge-level protection against abusive traffic and no gate distinguishing real browser sessions from scripted/bot traffic on write and expensive-read endpoints.

## Decision

Add AWS WAFv2 on the ALB: a per-IP rate limit (2,000 requests / 5 minutes, block), the managed `AmazonIpReputationList` and `KnownBadInputsRuleSet` (block), and the managed `CommonRuleSet` running in count mode initially — its 8KB `SizeRestrictions_BODY` rule would break msgpack assignment saves, so it soaks in CloudWatch before being flipped to block with exclusions. Mint a stateless, silent-captcha-backed session: a client verifies an invisible captcha and receives a 4-hour HS256 JWT (signed with the existing `SECRET_KEY`, no database row), verified by a `require_session` dependency in microseconds via signature and expiry check. `require_session` gates writes and expensive reads (document/assignment mutation, colors, num_districts, metadata, stats, evaluation, unassigned, contiguity, export, comment-flag). Enforcement is flag-gated (`SESSION_ENFORCE`, default `false` at rollout) so invalid/missing tokens only log a warning until the flag is flipped. A constant-time-compared `RESEARCH_API_KEY` header bypasses the gate for known scripts.

## Consequences

Edge-level abuse (volumetric, known-bad-input, reputation-listed traffic) is filtered before it reaches the API. Application-level write/expensive-read protection is decoupled from database state — session verification costs a signature check, not a query — and rollout is reversible by flag rather than by redeploy. The `CommonRuleSet`'s soak-then-block pattern and the `SESSION_ENFORCE` flag are both explicit two-step rollouts, not single-shot changes: shipping the code is not the same as shipping enforcement.

## Revisit when

After the `CommonRuleSet` soak period, deciding whether its body-size rule needs exclusions before flipping it to block; and after `SESSION_ENFORCE` is flipped to `true`, whether the research-key bypass is still needed.
