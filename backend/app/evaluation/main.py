"""Top-level orchestration for document evaluation metrics.

`update_or_select_document_evaluation` is the request-path entry point: it
reads the cached `Evaluation` row, recomputes if it is missing/stale, and
persists the result. `compute_metrics` is the pure computation: build a
single `DocumentEvaluationContext` and run every metric in `METRICS`.
"""

import logging
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import text
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
    one compute instead of N; losers wake on the winner's commit and return
    its cached row.

    Failures are never cached — a cache hit always returns `failed=[]`.
    """
    evaluation = session.exec(
        select(Evaluation).where(Evaluation.document_id == document.document_id)
    ).one_or_none()
    if cached := _cached_envelope(evaluation, document):
        return cached

    # The session default lock_timeout (15s) is shorter than a slow compute;
    # SET LOCAL scopes the raise to this transaction only.
    session.execute(text("SET LOCAL lock_timeout = '120s'"))
    session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:doc, 0))"),
        {"doc": str(document.document_id)},
    )
    # If we blocked above, a concurrent winner committed while we waited —
    # re-read past the identity map and return its row.
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
