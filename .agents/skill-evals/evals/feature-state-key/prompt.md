---
name: feature-state-key
tags: [cut-challenge, f4]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

Add a "preview highlight": when the user hovers a district's row in the sidebar, the
corresponding district's geometry on the map should glow. A colleague suggests the
sidebar row's hover handler can just call
`mapRef.setFeatureState(feature, {hover: true})` for the district's features, since a
hover feature-state already exists. Evaluate that suggestion and describe how you
would implement the highlight (do not write files; state the design and your
reasoning).
