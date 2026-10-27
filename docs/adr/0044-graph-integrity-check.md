# 44. Daily S3 graph comprehensiveness check with SNS alerting

Date: 2026-07-06 (recorded retrospectively 2026-09-08)

## Status

Accepted.

## Context

Adjacency graphs are built per gerrydb table and uploaded to S3 by the pipeline ([0039](0039-pipeline-built-hybrid-graph.md); pickles at the time, `.npz` since PR #771); nothing verified that every `DistrictrMap` with a gerrydb table actually had a corresponding graph object in S3 (PR #595, closing #569).

## Decision

Add a `check-missing-graphs` CLI command that queries all visible `DistrictrMap` records with a `gerrydb_table_name` and does an `s3.head_object` check for each graph object (`graphs/{name}.pkl` at the time; `graphs/{name}.npz` since PR #771). Run it daily via a dedicated ECS Fargate task on an EventBridge Scheduler rule; any missing files trigger a single SNS alert email.

## Consequences

A missing graph object surfaces as a daily alert instead of being discovered only when a user's contiguity check fails. The check task reuses the backend's image and a least-privilege task role scoped to `s3:GetObject`/`s3:ListBucket` and `sns:Publish` on the alarm topic.
