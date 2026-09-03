---
name: run-api-contract-audit
description: Runs a static, name-matching heuristic diff between backend Pydantic/SQLModel response fields and the frontend's hand-written API TypeScript interfaces, to surface likely drift after either side changes. Use after editing a FastAPI endpoint's response model, a SQLModel/Pydantic schema, or the frontend's apiHandlers/types.ts — before assuming the two sides still agree on field names.
---

# API contract audit

This repo has no generated OpenAPI client: `app/src/app/utils/api/apiHandlers/types.ts`
is hand-maintained against the backend's Pydantic/SQLModel response models, so the
two can drift silently whenever one side changes without the other.

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/audit_contracts.py
```

Run from the repo root (`--help` for path overrides). Exits nonzero on drift, so it
works as a pre-push check. The report explains its own labels and prints its
limitations at the end of every run — treat a reported drift as a lead to verify
against the actual endpoint and type definitions, not a verdict.
