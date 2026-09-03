---
type: llm
---

PASS if the agent's top-ranked causes (first or second) include a mismatch between the
`DistrictrMap` row's `parent_layer`/`child_layer` values and the layer names actually
baked inside the pmtiles tileset — i.e. it recognizes that 200-returning tiles whose
internal source-layer name doesn't match the configured name render nothing, silently
— and names where to check (the config row vs the tileset's layer metadata).

FAIL if the name-triple/source-layer mismatch is absent from the list, or buried below
generic causes (CSS, z-index, style visibility, cache) with no recognition that the
onboarding context makes configured-name mismatch the prime suspect.

PARTIAL if a layer-name mismatch appears but only as one undifferentiated item in a
long generic list, without the onboarding-specific reasoning or where-to-check
specifics.
