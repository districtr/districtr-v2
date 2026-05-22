"""Tests for demographic evaluation metrics (app.evaluation.demographic).

Fixture map: simple_child_geos (6 blocks, real geometry near Kansas).
  Columns: total_pop_20, white_pop_20, black_pop_20.

Assignment: {1,2,5,6} → zone 1, {3,4} → zone 2.

  Zone 1 totals: total=1400, white=1260 (90%), black=65  (5%)
  Zone 2 totals: total= 700, white= 200 (29%), black=500 (71%)

  majority_districts → {"white": [1], "black": [2]}
"""

from datetime import datetime

import pytest
from fastapi import BackgroundTasks
from sqlmodel import Session

from app.evaluation.demographic import majority_districts
from app.evaluation.context import DocumentEvaluationContext


def _put_assignments(client, document_id, assignments):
    resp = client.put("/api/assignments", json={
        "document_id": document_id,
        "assignments": assignments,
        "last_updated_at": datetime.now().astimezone().isoformat(),
    })
    assert resp.status_code == 200


# ── majority_districts ────────────────────────────────────────────────────────


def test_majority_districts(client, session: Session, simple_child_geos_nonshatterable_districtr_map):
    """Zone 1 is white-majority, zone 2 is black-majority."""
    resp = client.post("/api/create_document", json={"districtr_map_slug": "simple_child_ns"})
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    _put_assignments(client, document_id, [
        ["000010000000001", 1], ["000010000000002", 1],
        ["000010000000003", 2], ["000010000000004", 2],
        ["000010000000005", 1], ["000010000000006", 1],
    ])

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = majority_districts(ctx)

    assert result["white"] == [1]
    assert result["black"] == [2]


def test_majority_districts_no_majority(client, session: Session, simple_child_geos_nonshatterable_districtr_map):
    """A zone where no group clears 50% returns an empty list for that group."""
    resp = client.post("/api/create_document", json={"districtr_map_slug": "simple_child_ns"})
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    # All 6 blocks in one zone: white=1260/2100 (60%), black=565/2100 (27%)
    _put_assignments(client, document_id, [
        ["000010000000001", 1], ["000010000000002", 1],
        ["000010000000003", 1], ["000010000000004", 1],
        ["000010000000005", 1], ["000010000000006", 1],
    ])

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = majority_districts(ctx)

    assert result["white"] == [1]
    assert result["black"] == []
