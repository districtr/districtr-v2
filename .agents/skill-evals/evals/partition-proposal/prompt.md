---
name: partition-proposal
tags: [cut-challenge, f20]
runs: 3
max_turns: 30
allowed_tools: ["Read", "Grep", "Glob", "Skill"]
---

The `document.assignments` table holds one row per geography unit per document — tens
of thousands of rows per map plan, growing with every new document. Nearly every query
against it filters by `document_id`. Evaluate partitioning the table by `document_id`
(LIST or HASH) to improve query performance, and recommend whether we should do it.
Describe your recommendation and reasoning (do not write files).
