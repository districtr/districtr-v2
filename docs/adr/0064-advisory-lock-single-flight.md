# 64. Cache-cold computes are single-flight under polled advisory locks

Date: 2026-10-15 (PRs #793 and #794; recorded retrospectively 2026-10-23)

## Status

Accepted.

## Context

Two cache-cold computes are serialized per document with Postgres advisory locks so concurrent requests run one compute instead of many: the evaluation compute in `update_or_select_document_evaluation` (`pg_try_advisory_xact_lock` with polling, PR #607) and the district-stats rebuild in `update_or_select_district_stats` (a blocking `pg_advisory_xact_lock(public_id)`, PR #551). Both broke under ordinary traffic.

- **Blocking waiters hit `lock_timeout`.** Every pooled connection sets `lock_timeout = '15s'` ([0038](0038-backend-reliability-policy.md)), and Postgres applies it to advisory locks. When a stats rebuild ran past 15 s, the waiting request was cancelled and returned 504 "Database timeout". This happened whenever the Evaluate view sent `/stats` and `/evaluation` together, or a post-save republish raced the display view's `/stats` (PR #793). A blocked waiter also holds its pooled connection for the whole wait.
- **Mid-compute commits released the evaluation lock.** `compute_metrics` commits the request session partway through, in `update_or_select_district_stats` and `CountyContext._populate_county_data`. The commit ended the transaction and released the xact lock, so waiters took it and computed again; the `IntegrityError` fallback on insert hid the double compute (PR #794).

## Decision

- **Waiters poll; they never block.** A request that loses the race calls `pg_try_advisory_*` every second (`STATS_LOCK_POLL_SECONDS`, `EVAL_LOCK_POLL_SECONDS`), releases the session's connection while it sleeps, and re-checks the cache after each attempt and again after acquiring, since the winner may have filled it. The evaluation path's first release is a `commit()` rather than a `rollback()`, so a caller's pending writes survive.
- **The wait is bounded at 120 s, the ALB idle timeout** (`STATS_LOCK_WAIT_SECONDS`, `EVAL_LOCK_WAIT_SECONDS`). At the deadline the client has already been timed out. The stats rebuild then raises 504 rather than run a duplicate heavy union against the shared database. The evaluation compute instead computes without the lock, because its insert tolerates a concurrent commit.
- **The lock must outlive every commit inside the work.** A transaction-level lock on the request session is enough only when nothing commits that session during the work, as in the stats rebuild. When the work commits midway, as evaluation does, the lock is session-level (`pg_try_advisory_lock`) on its own `engine.connect()` connection (`_try_eval_lock`). That connection commits right after acquiring, so `idle_in_transaction_session_timeout` (60 s) cannot kill it mid-compute. It unlocks in a `finally` (`_release_eval_lock`). If the unlock fails, the connection is invalidated, never returned to the pool, because the pool's reset-on-return is a `ROLLBACK`, which keeps session-level locks. Closing the backend releases the lock.

## Alternatives considered

- Skip the stats commit when an evaluation owns the transaction (`commit=False`). Tried first in PR #794 and rejected: the stats rebuild lock and the rebuilt rows then stay uncommitted for the whole evaluation, so a concurrent `/stats` on the same cold document waits behind them and fails at the 15 s `lock_timeout`.
- A session-level lock on the request session. It can leak: a SQLAlchemy `Session` hands its connection back to the pool on every commit or rollback, so the unlock may run on a different connection than the lock.

## Consequences

A cold `/stats` waits for the winner, up to 120 s, instead of failing at 15 s. The frontend's view-transition overlay (`useViewTransition.ts`) extends from 15 s to 120 s while a stats or evaluation query is still fetching. Waiters hold no pooled connection while they sleep, but each one occupies a threadpool thread ([0053](0053-fastapi-handler-dispatch.md)). Each winning evaluation holds two pooled connections, the lock connection and the request session, for the length of its compute. About 30 concurrent cold evaluations on different documents would therefore fill a worker's 60-connection pool ([0045](0045-concurrency-ceilings.md), [0053](0053-fastapi-handler-dispatch.md)); a `ponytail:` comment in `_try_eval_lock` names the escape hatch, a small dedicated engine for the lock. Session-level advisory locks require direct Postgres connections: they do not survive transaction-mode pooling such as PgBouncer or RDS Proxy, and none is in the stack today.

## Revisit when

A connection pooler is put in front of Postgres, cold evaluations exhaust the pool under load, or these computes move off the request path.
