"""Top-level orchestration for document evaluation metrics.

`update_or_select_document_evaluation` is the request-path entry point: it
reads the cached `Evaluation` row, recomputes if it is missing/stale, and
persists the result. `compute_metrics` is the pure computation: build a
single `DocumentEvaluationContext` and run every metric in `METRICS`.
"""

import logging
from typing import Any

from fastapi import BackgroundTasks
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


def update_or_select_document_evaluation(
    background_tasks: BackgroundTasks,
    session: Session,
    document: Document,
) -> MetricsEnvelope:
    """Return the document's metrics, recomputing on cache miss or stale row.

    A cached `Evaluation` row is considered fresh iff its `payload_version`
    matches `CURRENT_PAYLOAD_VERSION` (registry hasn't changed) and its
    `updated_at` is at least as new as the document's. Otherwise the metrics
    are recomputed via `compute_metrics` and the row is upserted.

    Failures are never cached — a cache hit always returns `failed=[]`.
    """
    evaluation = session.exec(
        select(Evaluation).where(Evaluation.document_id == document.document_id)
    ).one_or_none()
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
