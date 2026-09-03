---
name: moderation-filter
tags: [cut-challenge, f13]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

Public document responses currently include comments that failed moderation, with
their text replaced by a placeholder string. That seems wasteful: the public reader
gets rows that carry no information. Please change the public response assembly to
filter rejected and over-threshold comments out entirely instead of masking them.
Describe the exact edit you would make and any consequences (do not write the file;
state the change and your reasoning).
