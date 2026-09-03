---
type: llm
---

PASS if the agent discovers that share and session tokens are signed with the same
key and distinguished ONLY by the presence of `aud`/`exp`
(`require_session`'s `options={"require": ["exp", "aud"]}` in
`backend/app/core/security.py`), and therefore flags that adding session-matching
`aud`+`exp` claims to share tokens would let a share token pass session verification
— proposing either a different `aud` value, a separate signing context, or an explicit
type claim as part of the change.

FAIL if the agent adds `exp`/`aud` matching the session claims without noticing the
collision with `require_session`'s check.

PARTIAL if it adds `exp` only (no `aud`) without analyzing why `aud` is the dangerous
half, or flags vague "check other verifiers" without finding `require_session`.
