"""Tests for validity evaluation metrics (app.evaluation.validity).

Grid integration topology (8×8 blocks / 4×4 VTDs, 16 nodes each):

    assigned_units — non-shatterable VTD map (grid_parent):
        All 16 assigned (4-quadrant) → assigned_count=16, total_count=16
        Only first-row 4 assigned   → assigned_count=4,  total_count=16

    assigned_units — shatterable map, parent-only assignments (grid_shatterable):
        All 16 VTDs assigned (no blocks) → unit_to_zone empty → same path as
        non-shatterable; assigned_count=16, partially_assigned_count=0

    population_deviation — simple_child_geos (6 blocks near Kansas, real geometry):
        {1,2,5,6} → zone 1 (total_pop_20=100+200+500+600=1400)
        {3,4}     → zone 2 (total_pop_20=300+400=700)
        top_to_bottom_deviation = (1400−700)/700 = 1.0
        ideal = 2100 // 2 = 1050  →  maximal_absolute_deviation = 350
"""

from datetime import datetime

import pytest
from fastapi import BackgroundTasks
from sqlmodel import Session

from app.evaluation.validity import (
    assigned_units,
    ideal_population,
    population_deviation,
)
from app.evaluation.context import DocumentEvaluationContext
from tests.conftest import _block_geoid, _vtd_geoid


def _put_assignments(client, document_id, assignments):
    resp = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": assignments,
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert resp.status_code == 200


# ── assigned_units: non-shatterable VTD map ───────────────────────────────────


def test_assigned_units_all(
    client,
    session: Session,
    grid_nonshatterable_parent_districtr_map,
    mock_grid_graph_file,
):
    """All 16 VTDs assigned (4-quadrant) → assigned_count=16, partially_assigned_count=0."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "grid_parent"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    assignments = [
        [_vtd_geoid(pr, pc), (pr // 2) * 2 + (pc // 2) + 1]
        for pr in range(4)
        for pc in range(4)
    ]
    _put_assignments(client, document_id, assignments)

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = assigned_units(ctx)

    assert result["assigned_count"] == 16
    assert result["split_count"] == 0
    assert result["partially_assigned_count"] == 0
    assert result["total_count"] == 16
    assert result["unit_type"] == "vtd"


def test_assigned_units_partial(
    client,
    session: Session,
    grid_nonshatterable_parent_districtr_map,
    mock_grid_graph_file,
):
    """Only the 4 VTDs in the first row assigned → assigned_count=4, total_count=16."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "grid_parent"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    _put_assignments(client, document_id, [[_vtd_geoid(0, pc), 1] for pc in range(4)])

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = assigned_units(ctx)

    assert result["assigned_count"] == 4
    assert result["split_count"] == 0
    assert result["partially_assigned_count"] == 0
    assert result["total_count"] == 16


# ── assigned_units: shatterable map, parent-only assignments ──────────────────


def test_assigned_units_shatterable_parent_only(
    client, session: Session, grid_shatterable_districtr_map, mock_grid_graph_file
):
    """Shatterable map, all VTDs assigned (no blocks) → unit_to_zone empty, same counts as non-shatterable."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "grid_shatterable"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    assignments = [
        [_vtd_geoid(pr, pc), 1 if pc < 2 else 2] for pr in range(4) for pc in range(4)
    ]
    _put_assignments(client, document_id, assignments)

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = assigned_units(ctx)

    assert result["assigned_count"] == 16
    assert result["split_count"] == 0
    assert result["partially_assigned_count"] == 0
    assert result["total_count"] == 16
    assert result["unit_type"] == "vtd"


def test_assigned_units_shatterable_split_vtd(
    client, session: Session, grid_shatterable_districtr_map, mock_grid_graph_file
):
    """Shatterable map: one VTD shattered with blocks in 2 districts → split_count=1.

    VTD(0,0) blocks: (0,0),(0,1) → zone 1; (1,0),(1,1) → zone 2.
    Remaining 15 VTDs assigned whole → zone 1.
    """
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "grid_shatterable"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    # Assign the 4 blocks of VTD(0,0) split across two zones
    split_block_assignments = [
        [_block_geoid(0, 0), 1],
        [_block_geoid(0, 1), 1],
        [_block_geoid(1, 0), 2],
        [_block_geoid(1, 1), 2],
    ]
    # Assign the other 15 VTDs as whole-VTD parent assignments
    other_vtd_assignments = [
        [_vtd_geoid(pr, pc), 1]
        for pr in range(4)
        for pc in range(4)
        if (pr, pc) != (0, 0)
    ]
    _put_assignments(client, document_id, split_block_assignments + other_vtd_assignments)

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = assigned_units(ctx)

    assert result["assigned_count"] == 15
    assert result["split_count"] == 1
    assert result["partially_assigned_count"] == 0
    assert result["total_count"] == 16
    assert result["unit_type"] == "vtd"


# ── population_deviation ──────────────────────────────────────────────────────


def test_population_deviation(
    client, session: Session, simple_child_geos_nonshatterable_districtr_map
):
    """{1,2,5,6}→zone 1 (pop=1400), {3,4}→zone 2 (pop=700), ideal=1050 → top_to_bottom=1.0, max_abs_dev=350."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "simple_child_ns"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    _put_assignments(
        client,
        document_id,
        [
            ["000010000000001", 1],
            ["000010000000002", 1],
            ["000010000000003", 2],
            ["000010000000004", 2],
            ["000010000000005", 1],
            ["000010000000006", 1],
        ],
    )

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    result = population_deviation(ctx)

    assert result["most_populous_district"] == 1
    assert result["least_populous_district"] == 2
    assert result["top_to_bottom_deviation"] == pytest.approx(1.0, abs=1e-6)
    assert result["maximal_absolute_deviation"] == 350


# ── ideal_population ──────────────────────────────────────────────────────────


def test_ideal_population_uses_map_num_districts_not_assigned_count(
    client, session: Session, simple_child_geos_nonshatterable_districtr_map
):
    """ideal_population divides by the map's num_districts (2), not the number of
    currently non-empty districts — so a half-finished plan with only one zone
    assigned still returns total_pop // 2, not total_pop // 1."""
    resp = client.post(
        "/api/create_document", json={"districtr_map_slug": "simple_child_ns"}
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    # Assign only 3 of 6 blocks to zone 1 — zone 2 is intentionally left empty.
    # total_pop_20 across all 6 blocks = 100+200+300+400+500+600 = 2100
    # ideal_population should be 2100 // 2 = 1050, not 2100 // 1 = 2100.
    _put_assignments(
        client,
        document_id,
        [
            ["000010000000001", 1],
            ["000010000000002", 1],
            ["000010000000003", 1],
        ],
    )

    ctx = DocumentEvaluationContext(
        background_tasks=BackgroundTasks(), session=session, document_id=document_id
    )
    assert ideal_population(ctx) == 1050
