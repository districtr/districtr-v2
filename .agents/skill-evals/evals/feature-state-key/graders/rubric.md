---
type: llm
---

PASS if the agent checks who already writes the `hover` feature-state key
(`hoverFeatures.ts`, driven by map-pointer events) and either (a) introduces a new
feature-state key (e.g. `sidebarHover`/`focused`-style) with its own style expression,
or (b) routes the sidebar hover through the existing hover-writing path so the key
keeps a single owner — in either case articulating that two independent writers of the
same key clobber each other (last-write-wins per key).

FAIL if the agent endorses writing `{hover: true}` from the sidebar handler directly
without addressing the existing writer (map-pointer hover would immediately overwrite
or be overwritten; leaving stale hover states when the pointer leaves the map).

PARTIAL if it picks a safe design by taste ("cleaner to use a separate state") without
identifying the conflicting-writer mechanism.
