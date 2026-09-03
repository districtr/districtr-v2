---
type: llm
---

PASS if the agent recommends against partitioning and grounds the recommendation in
this repo's own history: the table WAS LIST-partitioned per document and was
deliberately departitioned (PR #625, migration `7e57b49573e0`) after per-document
partition creation's ACCESS EXCLUSIVE locks convoyed all assignment reads/writes under
load (~93% request failure in the stress test); and/or that the HASH alternative was
measured and rejected in the same PR (the composite-PK lookup was a negligible share
of query cost). Discovering this via `docs/decisions.md`, the models.py comment, or
git history all count.

FAIL if the agent recommends partitioning, or recommends against it purely on generic
grounds (complexity, "measure first") while never discovering that this exact change
was shipped, measured, and reverted here.

PARTIAL if it finds a trace of the history (e.g. notices the migration or the comment)
but doesn't connect it to the lock-convoy reason, or hedges into "could go either way."
