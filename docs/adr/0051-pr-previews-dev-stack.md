# 51. Ephemeral PR previews as label-driven clones on the dev stack

Date: 2026-08-05 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

PR previews had gone through several iterations. Per-PR apps were first added on Fly (PR #116), forking a database and deploying separate `api`/`app` instances per PR, then torn down again (PR #496: "We no longer need deploy previews, but do need a dev preview!"). Label-driven Fly previews were reintroduced (PR #574): a `Preview: FE` label deployed a frontend pointed at the shared dev backend, and `Preview: Fullstack` deployed frontend plus a backend with Postgres forked from dev, both named by PR number and torn down on close or label removal. By the time of PR #649, dev and prod already ran on AWS (ECS Fargate behind an ALB, Pulumi-provisioned) — PR previews were the one piece still deploying to Fly.

## Decision

Move PR previews onto the same AWS stack as dev and prod, piggybacking on the dev stack instead of provisioning separate Fly apps. Labeling a PR `Preview: FE` clones the dev frontend task definition behind its own ALB target group and host-header rule (`pr-<N>.dev.districtr.org`), pointed at the shared dev backend. `Preview: Fullstack` also stands up a backend behind its own host-header rule (`api-pr-<N>.dev.districtr.org`), with a database restored from dev's latest automated RDS snapshot. Authentication uses a dedicated, narrowly-scoped `districtr-gha-preview` IAM role, deliberately separate from the admin-scoped deploy role, since `pull_request` workflow runs execute the PR's own code. Labeling, unlabeling, and closing a PR all route through one workflow for deploy and teardown, with a PR comment kept current with the live URLs.

## Consequences

PR previews run on the same infrastructure model as dev and prod, so there is no longer a separate Fly deployment path to maintain in parallel with the AWS platform (ADR 0043). Because preview workflows execute a PR's own code, they run under a purpose-scoped IAM role rather than the deploy role used for trusted merges to dev/main.
