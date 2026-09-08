# 43. AWS platform on ECS Fargate, provisioned by Pulumi

Date: 2026-06-26 (PR #561; cutover #698/#701; recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

The platform ran on Fly.io from the first deploys (PR #29, 2024-08). Ahead of launch-scale traffic, the team needed managed autoscaling, a managed PostGIS with real operational controls, and infrastructure as reviewable code.

## Decision

Full migration to AWS (PR #561, phases 1–3; DNS cutover to the apex completed in #698/#701): ECS Fargate services behind one ALB per environment (host-based routing, ACM, HTTP→HTTPS, fixed 403 for `/metrics` and `/_debug/*`), RDS PostgreSQL/PostGIS (Multi-AZ in prod), and Pulumi TypeScript with an S3 state backend as the infrastructure source of truth. Deploys authenticate via GitHub OIDC — no long-lived cloud keys in CI — and the ECS task role replaces static AWS credentials in the backend (`AWS_USE_DEFAULT_CREDENTIALS`). Cost-deliberate networking: public subnets with strict security-group chaining (ALB → tasks → DB) and no NAT gateway; a free S3 gateway endpoint carries graph and thumbnail traffic. Graph pickles stream from S3 directly into memory — no data volume on Fargate. Secrets flow Pulumi config (KMS) → SSM SecureStrings → task definitions. A RunTask-only migrate task replaces Fly's release command; deployment circuit breakers roll back failed deploys.

## Consequences

Each ECS task is a single uvicorn process — the fact that sized the concurrency decisions ([0045](0045-concurrency-ceilings.md)) and motivated the event-loop discipline ([0053](0053-fastapi-handler-dispatch.md)). PR previews piggyback on the dev stack ([0051](0051-pr-previews-dev-stack.md)). Fly.io survives only in this record's Context.
