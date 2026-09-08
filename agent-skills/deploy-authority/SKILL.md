---
name: deploy-authority
description: Editing infrastructure code, deploy workflows, or anything that could apply changes to live AWS infrastructure — Pulumi, GitHub Actions deploy/preview workflows, deploy roles.
paths:
  - "infra/**"
  - ".github/workflows/**"
user-invocable: false
---

# Deploy Authority

## Constraints

- **Live infrastructure changes only through CI on a merged branch (`main`/`dev`).** Every pre-merge context — a local session, a PR-triggered workflow — is preview-only and must never hold credentials that can deploy, because pre-merge contexts execute unreviewed code. Concretely:
  - `pulumi up` is CI's alone; local Pulumi work is `pulumi preview` only. Applying is deploying — it is not the build/test step of the infra world.
  - `preview.yml` runs a PR's own code under the narrow `districtr-gha-preview` role; the admin-scoped `districtr-gha-deploy` role is reserved for `dev`/`main` workflows. Any new `pull_request`-triggered workflow stays on the narrow role.

`infra/README.md` is the deep reference (architecture, per-service table, deploy mechanics, rollback, secrets, DB access) — read it before editing anything in `infra/`. Dev-environment facts (compose stack, env files) live in `docs/overview.md`.
