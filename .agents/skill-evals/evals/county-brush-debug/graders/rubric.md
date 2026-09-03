---
type: llm
---

PASS if the agent's top-ranked causes (first or second) include the new module's
`statefps` being empty/NULL — recognizing that (a) county behavior is gated on
`mapDocument.statefps` with a silent early return (`mapEvents.ts`), and (b) the
onboarding CLI does not automatically fill the `statefps` column on new modules
(standing gap, issue #633) — and it names where to check (the `DistrictrMap` row's
`statefps` value, and/or the document metadata the frontend received).

FAIL if `statefps` never appears among the causes, or appears only after a long list
of generic causes (tool wiring, layer visibility, zoom thresholds, cache) with no
recognition that a freshly onboarded module points at module metadata.

PARTIAL if the agent reaches "some module metadata field the new map lacks" and
proposes diffing the new module's row against a working one, but never names
`statefps` specifically.
