---
name: api-contract-audit
description: Runs a static, name-matching heuristic diff between backend Pydantic/SQLModel response fields and the frontend's hand-written API TypeScript interfaces, to surface likely drift after either side changes. Use after editing a FastAPI endpoint's response model, a SQLModel/Pydantic schema, or the frontend's apiHandlers/types.ts — before assuming the two sides still agree on field names.
---

# API contract audit

This repo has no generated OpenAPI client: `app/src/app/utils/api/apiHandlers/types.ts`
is hand-maintained against the backend's Pydantic/SQLModel response models, so the
two can drift silently whenever one side changes without the other.

## Run it

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/audit_contracts.py
```

Defaults to `backend/app` and
`app/src/app/utils/api/apiHandlers/types.ts` (this repo's actual layout);
override with `--backend-dir` / `--ts-file` if auditing a different pair.
Run it from the repo root. It does static analysis only — `ast.parse` on the
Python, regex on the TypeScript — and never imports or executes either
codebase, so it needs no environment setup and is safe to run against
mid-edit, broken code.

It exits nonzero when it finds field-name drift, so it's suitable as a
pre-push check as well as an interactive one.

## Reading the report

For each backend class and frontend interface/type whose *normalized* names
match (case-insensitive, with a trailing role suffix like `Public`/`Create`/
`Response`/`Result` stripped), it prints the field-name set difference in
both directions: fields the backend serializes that the frontend type doesn't
declare, and vice versa.

- **`only on backend`**: the frontend type is missing a field the API
  actually returns — likely just means nothing consumes it yet, or the
  frontend type needs updating to stop dropping it silently.
- **`only on frontend`**: the frontend expects a field the backend response
  model doesn't have — likely a stale field after a backend rename/removal,
  or the frontend type was written ahead of a backend change that hasn't
  landed.
- Backend classes are matched by name after chasing their local base classes
  (e.g. `DocumentCreatePublic(DocumentPublic)` gets `DocumentPublic`'s fields
  too), same for frontend `extends`.

Every run ends with a "Limitations" section — always read it before acting
on a finding; a false positive from an unrelated same-named pair is a real
and expected failure mode of the name-matching approach.

## What this tool is (and isn't)

This is a v1 heuristic: name-matching only, no type-compatibility checking
(a field present on both sides with a `str` vs `number` mismatch is
invisible to it), no handling of a field that was intentionally renamed
across the language boundary. Treat a reported drift as a lead to check by
reading the actual endpoint and type definitions, not as a verdict.
