# 45. Concurrency ceilings sized from stress-test evidence

Date: 2026-07-15 (recorded retrospectively 2026-09-08)

## Status

Accepted. Amended by [0052](0052-mmap-shared-graphs.md).

## Context

A production stress-test harness (PR #607) simulated realistic viewer/eval/editor traffic against `api.beta.districtr.org`. Its first full run (`run1`, 12,750 simulated users, 2026-07-15) failed 94% of requests while compute sat idle (ECS CPU 15%, RDS 17%) (PR #623). The failures PR #623 traced went to configuration, not hardware (PR #625 found a further cause a day later: skewed test traffic and the lock convoy of [0046](0046-assignments-departitioned.md)): ECS autoscaling only watched CPU, which an I/O-bound workload never raises; each task's DB pool defaulted to SQLAlchemy's 15 connections, which was run1's hard concurrency wall; and the anyio threadpool capped sync routes at 40.

## Decision

Size concurrency limits from the stress-test evidence rather than framework defaults: autoscale ECS on request count (a second target-tracking policy on `ALBRequestCountPerTarget`, 600 req/min/task, alongside the existing CPU policy) in addition to CPU; raise the per-task DB pool to 60 connections (`pool_size=40, max_overflow=20`); raise the anyio threadpool limiter to 80 tokens to cover non-DB work (S3 graph loads, evaluations) above the larger DB pool.

## Consequences

At 60 connections/task (one uvicorn process per task at the time), RDS's connection ceiling (~900) allowed roughly 14 tasks, above the fleet's then-current max of 6 — headroom sized against measured, not assumed, demand. Because request-count autoscaling reacts to actual load rather than CPU (which an I/O-bound backend rarely saturates), the fleet now scales out under the traffic pattern that caused run1's failures. These ceilings are stress-test-derived; a materially different traffic shape would call for a fresh stress-test run before retuning them again.
