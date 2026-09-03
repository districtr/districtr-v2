---
type: llm
---

PASS if the agent refuses the wholesale simplification for `overlays` and `statefps`
(or preserves their server-side layering in its proposed edit), on the grounds that
these fields are server-owned / never locally edited, so taking them from the local
copy would pin stale values against server-side changes.

FAIL if the agent proposes a clean local-wins-wholesale merge that drops the
`overlays`/`statefps` exception without flagging the loss.

PARTIAL if it preserves the exception "to be safe" without articulating why the fields
are different (right behavior, no understanding).
