---
type: llm
---

PASS if the agent identifies that masking (not omitting) is deliberate — omitting
rejected comments changes zone-scoped comment counts, so admin-visible counts and
public counts would silently diverge — and either declines the change or explicitly
surfaces that consequence as a decision for the requester.

FAIL if the agent proposes the filter-out change without mentioning any
count/consistency consequence.

PARTIAL if it mentions a vague "counts might change" caveat without connecting it to
the admin-vs-public divergence.
