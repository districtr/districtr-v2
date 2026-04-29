from sqlmodel import Session
from typing import Any
from app.evaluation.models import Evaluation
from sqlmodel import select
from app.evaluation.registry import CURRENT_PAYLOAD_VERSION, METRICS
from fastapi import BackgroundTasks
from app.evaluation.context import EvaluationContext


def update_or_select_document_evaluation(
    background_tasks: BackgroundTasks,
    session: Session,
    document_id: str,
) -> dict[str, Any] | None:
    evaluation = session.exec(
        select(Evaluation).where(Evaluation.document_id == document_id)
    ).one_or_none()
    if evaluation and evaluation.payload_version == CURRENT_PAYLOAD_VERSION:
        return evaluation.metrics
    computed_metrics = compute_metrics(background_tasks, session, document_id)

    if evaluation:
        evaluation.metrics = computed_metrics
        evaluation.payload_version = CURRENT_PAYLOAD_VERSION
    else:
        session.add(
            Evaluation(
                document_id=document_id,
                metrics=computed_metrics,
                payload_version=CURRENT_PAYLOAD_VERSION,
            )
        )
    session.commit()
    return computed_metrics


def compute_metrics(
    background_tasks: BackgroundTasks, session: Session, document_id: str
) -> dict[str, Any]:
    context = EvaluationContext(
        background_tasks=background_tasks, session=session, document_id=document_id
    )
    metric_payloads: dict[str, Any] = {}
    for metric in METRICS:
        metric_payloads[metric.key] = metric.compute(context)
    return metric_payloads
