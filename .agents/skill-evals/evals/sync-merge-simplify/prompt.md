---
name: sync-merge-simplify
tags: [cut-challenge, f15]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

In `app/src/app/utils/api/apiHandlers/fetchDocument.ts`, the merge that runs when the
local IndexedDB copy wins still copies a couple of fields from the server response
instead of taking everything from the local document. This looks inconsistent. Please
simplify the merge so that whichever side wins, wins wholesale — local wins means every
field comes from the local copy. Describe the exact edit you would make (do not write
the file; state the change and your reasoning).
