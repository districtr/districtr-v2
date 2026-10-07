"""Top-level orchestration for document evaluation metrics.

`update_or_select_document_evaluation` is the request-path entry point: it
reads the cached `Evaluation` row, recomputes if it is missing/stale, and
persists the result. `compute_metrics` is the pure computation: build a
single `DocumentEvaluationContext` and run every metric in `METRICS`.
"""

import logging
from time import monotonic, sleep
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import func
from sqlmodel import Session, select

from app.evaluation.models import Evaluation
from app.evaluation.registry import (
    CURRENT_PAYLOAD_VERSION,
    METRICS,
    Metric,
    hash_payload_version,
)
from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.types import MetricFailure, MetricsEnvelope
from app.models import Document

logger = logging.getLogger(__name__)

EVAL_LOCK_POLL_SECONDS = 1.0
EVAL_LOCK_WAIT_SECONDS = 120.0


def _cached_envelope(
    evaluation: Evaluation | None, document: Document
) -> MetricsEnvelope | None:
    """Return the cached envelope iff the row is fresh, else None.

    Fresh iff `payload_version` matches `CURRENT_PAYLOAD_VERSION` (registry
    hasn't changed) and `updated_at` is at least as new as the document's.
    """
    if (
        evaluation
        and evaluation.payload_version == CURRENT_PAYLOAD_VERSION
        and evaluation.updated_at
        and document.updated_at
        and evaluation.updated_at >= document.updated_at
    ):
        return MetricsEnvelope(
            payload_version=evaluation.payload_version,
            metrics=evaluation.metrics,
            failed=[],
        )
    return None


def update_or_select_document_evaluation(
    background_tasks: BackgroundTasks,
    session: Session,
    document: Document,
) -> MetricsEnvelope:
    """Return the document's metrics, recomputing on cache miss or stale row.

    On a miss, a per-document Postgres advisory lock serializes computes
    across all backend tasks so a thundering herd of cache-cold requests runs
    one compute instead of N. Losers poll instead of blocking on the lock:
    a parked waiter holds its pooled connection for the whole compute, so
    ~60 cache-cold requests on one document would exhaust a task's pool
    (40 + 20 overflow) and starve unrelated endpoints. The lock is held for the
    whole compute, across any commits compute_metrics makes (see
    `_try_eval_lock`).

    Failures are never cached — a cache hit always returns `failed=[]`.
    """
    evaluation = session.exec(
        select(Evaluation).where(Evaluation.document_id == document.document_id)
    ).one_or_none()
    if cached := _cached_envelope(evaluation, document):
        return cached

    doc_id = str(document.document_id)
    engine = session.get_bind().engine
    deadline = monotonic() + EVAL_LOCK_WAIT_SECONDS
    lock_conn = None
    try:
        # Release the session's connection before every lock attempt (and so
        # while losers sleep): holding it while checking out the lock
        # connection would let a burst of cold evals stall the pool, each
        # holding one connection and waiting on a second. Commit, not
        # rollback, so a caller's pending writes survive (the final commit
        # below would persist them anyway); later releases follow only reads.
        session.commit()
        while (lock_conn := _try_eval_lock(engine, doc_id)) is None:
            sleep(EVAL_LOCK_POLL_SECONDS)
            evaluation = session.exec(
                select(Evaluation).where(Evaluation.document_id == document.document_id)
            ).one_or_none()
            if cached := _cached_envelope(evaluation, document):
                return cached
            if monotonic() >= deadline:
                # Winner is wedged; compute without the lock rather than fail —
                # the IntegrityError path below tolerates concurrent commits.
                logger.warning(
                    "evaluation lock wait timed out for %s; computing without it",
                    document.document_id,
                )
                break
            session.rollback()
        else:
            # A winner may have committed between our cache check and the
            # acquire; expire so the re-read isn't served from the identity map.
            session.expire_all()
            evaluation = session.exec(
                select(Evaluation).where(Evaluation.document_id == document.document_id)
            ).one_or_none()
            if cached := _cached_envelope(evaluation, document):
                return cached

        envelope = compute_metrics(background_tasks, session, document.document_id)

        if evaluation:
            evaluation.metrics = envelope["metrics"]
            evaluation.payload_version = envelope["payload_version"]
            evaluation.updated_at = func.now()
        else:
            session.add(
                Evaluation(
                    document_id=document.document_id,
                    metrics=envelope["metrics"],
                    payload_version=envelope["payload_version"],
                )
            )
        try:
            session.commit()
        except IntegrityError:
            # A concurrent request computed and cached the same document first
            # (both saw a cold cache); our freshly computed envelope is still valid.
            session.rollback()
        return envelope
    finally:
        if lock_conn is not None:
            _release_eval_lock(lock_conn, doc_id)


def _try_eval_lock(engine: Engine, doc_id: str) -> Connection | None:
    """Take the per-document evaluation lock, or return None if another holds it.

    Session-level on a dedicated connection, not an xact lock on the request
    session: compute_metrics commits that session mid-compute (district stats,
    county data), which would release an xact lock early, and a Session hands
    its connection back to the pool on commit, so it can't own a session-level
    lock either.
    """
    # ponytail: each winner holds two pooled connections (lock, then request
    # session) for its compute, so ~30 concurrent cold evals on distinct
    # documents fill a 60/task pool; give the lock its own small engine if
    # that becomes real.
    conn = engine.connect()
    try:
        acquired = conn.execute(
            text("SELECT pg_try_advisory_lock(hashtextextended(:doc, 0))"),
            {"doc": doc_id},
        ).scalar_one()
        # End the implicit transaction so idle_in_transaction_session_timeout
        # can't kill the connection mid-compute; the lock outlives it.
        conn.commit()
    except BaseException:
        conn.invalidate()  # may hold the lock; never return it to the pool
        conn.close()
        raise
    if acquired:
        return conn
    conn.close()
    return None


def _release_eval_lock(conn: Connection, doc_id: str) -> None:
    """Unlock and return the connection; on failure, discard it instead.

    The pool's reset-on-return is a rollback, which keeps session-level locks,
    so a connection that may still hold the lock must never be pooled. Closing
    its backend releases the lock.
    """
    unlocked = False
    try:
        conn.execute(
            text("SELECT pg_advisory_unlock(hashtextextended(:doc, 0))"),
            {"doc": doc_id},
        )
        conn.commit()
        unlocked = True
    except Exception:
        logger.exception(
            "evaluation unlock failed for %s; discarding connection", doc_id
        )
    finally:
        if not unlocked:
            conn.invalidate()
        conn.close()


def compute_metrics(
    background_tasks: BackgroundTasks, session: Session, document_id: str
) -> MetricsEnvelope:
    """Build a fresh `DocumentEvaluationContext` and run every registered metric.

    Version is hashed from only the metrics that succeeded — a partial version
    differs from CURRENT_PAYLOAD_VERSION so a subsequent request detects
    staleness and recomputes.
    """
    context = DocumentEvaluationContext(
        background_tasks=background_tasks, session=session, document_id=document_id
    )
    if context.num_nonempty_districts == 0:
        return MetricsEnvelope(
            payload_version=CURRENT_PAYLOAD_VERSION, metrics={}, failed=[]
        )
    metric_payloads: dict[str, Any] = {}
    succeeded: list[Metric[Any]] = []
    failures: list[MetricFailure] = []
    for metric in METRICS:
        try:
            metric_payloads[metric.key] = metric.compute(context)
            succeeded.append(metric)
        except Exception as exc:
            logger.exception("metric %s failed, skipping", metric.key)
            failures.append(MetricFailure(key=metric.key, error=str(exc)))
    return MetricsEnvelope(
        payload_version=hash_payload_version(tuple(succeeded)),
        metrics=metric_payloads,
        failed=failures,
    )
