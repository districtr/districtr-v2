"""Top-level orchestration for document evaluation metrics.

`update_or_select_document_evaluation` is the request-path entry point: it
reads the cached `Evaluation` row, recomputes if it is missing/stale, and
persists the result. `compute_metrics` is the pure computation: build a
single `DocumentEvaluationContext` and run every metric in `METRICS`.
"""

from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.sql import func
from sqlmodel import Session, select

from app.evaluation.models import Evaluation
from app.evaluation.registry import CURRENT_PAYLOAD_VERSION, METRICS
from app.evaluation.context import DocumentEvaluationContext
from app.models import Document


def update_or_select_document_evaluation(
    background_tasks: BackgroundTasks,
    session: Session,
    document: Document,
) -> dict[str, Any] | None:
    """Return the document's metrics, recomputing on cache miss or stale row.

    A cached `Evaluation` row is considered fresh iff its `payload_version`
    matches `CURRENT_PAYLOAD_VERSION` (registry hasn't changed) and its
    `updated_at` is at least as new as the document's. Otherwise the metrics
    are recomputed via `compute_metrics` and the row is upserted.
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
        return evaluation.metrics
    computed_metrics = compute_metrics(background_tasks, session, document.document_id)

    if evaluation:
        evaluation.metrics = computed_metrics
        evaluation.payload_version = CURRENT_PAYLOAD_VERSION
        evaluation.updated_at = func.now()
    else:
        session.add(
            Evaluation(
                document_id=document.document_id,
                metrics=computed_metrics,
                payload_version=CURRENT_PAYLOAD_VERSION,
            )
        )
    session.commit()
    return computed_metrics


def compute_metrics(
    background_tasks: BackgroundTasks, session: Session, document_id: str
) -> dict[str, Any]:
    """Build a fresh `DocumentEvaluationContext` and run every registered
    metric, returning a `{metric_key: payload}` dict suitable for JSON
    serialisation into `Evaluation.metrics`."""
    context = DocumentEvaluationContext(
        background_tasks=background_tasks, session=session, document_id=document_id
    )
    metric_payloads: dict[str, Any] = {}
    for metric in METRICS:
        metric_payloads[metric.key] = metric.compute(context)
    return metric_payloads
