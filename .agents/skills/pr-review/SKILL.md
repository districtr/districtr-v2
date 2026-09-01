---
name: pr-review
description: Runs this repo's project-specific pre-merge checkpoints on a diff or PR — which project skills the change falls under, migration safety, API contract drift, and quality-gate status — on top of, not instead of, the built-in code-review and security-review skills. Use when asked to review a PR or branch for this repo, or before merging a change that touches the backend schema, API surface, or auth/share flow.
---

# PR review

This skill is deliberately thin. Generic review mechanics — correctness
bugs, reuse/simplification opportunities, security posture — belong to the
built-in `/code-review` and `security-review` skills; run those on the diff
as usual and do not reimplement their checks here. This skill adds only the
checkpoints that are specific to this repo's architecture and history.

## Checkpoints

1. **Which concern does this diff belong to?** Identify the touched surfaces
   and load the matching `learn-*` skill(s) (map rendering, state sync,
   backend/DB, map data lifecycle, performance, auth/share, CMS, infra — see
   `.agents/AGENTS.md`'s guide selection). Check the diff against that
   skill's stated invariants, not just for a syntax-level correctness pass.

2. **Migration safety** — if the diff touches `backend/app/alembic/`, apply
   the dangerous-operations checklist from
   [`migration-author`](../migration-author/SKILL.md): drops, type changes
   on large tables, anything touching the partitioned `parentchildedges`
   table, and lock-taking rewrites. Confirm `downgrade()` was actually
   exercised, not just present.

3. **Contract drift** — if the diff touches a FastAPI response model,
   SQLModel/Pydantic schema, or `app/src/app/utils/api/apiHandlers/types.ts`,
   run [`api-contract-audit`](../api-contract-audit/SKILL.md) and read its
   findings against the diff (it's a heuristic — a reported field-name
   mismatch is a lead to verify, not an automatic blocker).

4. **Gate status** — confirm [`quality-gate`](../quality-gate/SKILL.md) has
   been run for this diff's touched side(s) and is green, per that skill's
   cadence policy (cheap gates on every relevant change, expensive gates once
   per PR before push).

5. **Auth/security surface** — if the diff touches Auth0 scopes, Turnstile
   verification, or share/edit token handling, check it against
   [`learn-auth-share`](../learn-auth-share/SKILL.md)'s invariants in
   addition to running `security-review`.
