"""Tests for app.evaluation.compactness.

Unit-test graph topology (non-shatterable):
    a - b - c - d
    Zones: {a, b} = 1, {c, d} = 2 → 1 cut edge (b-c)

Shatterable map topology:
    Parent units: vtd:A (zone 1), vtd:B (zone 2) — adjacent with 3 block edges
    No individually-shattered blocks in baseline tests.

Grid integration-test topology (8×8 blocks / 4×4 parents, all weights = 2):
    Left-right 2-zone split  (c < 4 → zone 1, c ≥ 4 → zone 2):
        non-shatterable child  → 8 block cut edges  (one per row at the c=3/c=4 boundary)
        non-shatterable parent → 4 VTD  cut edges   (no weight; one per row of parents at pc=1/pc=2)
        shatterable (parent)   → 8 block cut edges  (4 parent boundary edges × weight 2)
        shatterable (child)    → 8 block cut edges  (Step 2 only, same as non-shatterable child)

    4-quadrant 4-zone split:
        non-shatterable child  → 16 block cut edges
        shatterable (parent)   → 16 block cut edges (8 parent boundary edges × weight 2)

    Mixed shatterable (top half at block level, bottom half at parent level):
        top  (r = 0..3): blocks, c < 4 → zone 1, c ≥ 4 → zone 2
        bottom (pr = 2..3): VTD parents, pc < 2 → zone 3, pc ≥ 2 → zone 4
        → 16 total:  Step 1 = 4  (2 bottom parent boundary edges × 2)
                     Step 2 = 12 (4 half-counted edges at c=3/4 + 8 direct at block row 3 / parent row 2)
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from networkx import Graph
from sqlmodel import Session

from app.evaluation.compactness import _infer_unit_type, block_cut_edges
from app.evaluation.context import DocumentEvaluationContext
from tests.conftest import BLOCK_GRID_NAME, PARENT_GRID_NAME, _block_geoid, _vtd_geoid


# ── Stub context ──────────────────────────────────────────────────────────────


class _StubCompactnessContext(DocumentEvaluationContext):
    def __init__(
        self,
        session,
        document_id="stub",
        child_layer=None,
        gerrydb_table="test_table",
        parent_layer=None,
    ):
        super().__init__(background_tasks=None, session=session, document_id=document_id)  # type: ignore[arg-type]
        self.__dict__["child_layer"] = child_layer
        self.__dict__["gerrydb_table"] = gerrydb_table
        self.__dict__["parent_layer"] = parent_layer


# ── _infer_unit_type ──────────────────────────────────────────────────────────


def test_infer_unit_type():
    assert _infer_unit_type("200510730003052") == "block"
    assert _infer_unit_type("vtd:20051xxxx") == "vtd"
    assert _infer_unit_type("bg:20051xxxx") == "bg"


# ── Grid integration tests (real DB + disk-backed graphs) ─────────────────────
#
# Fixtures defined in conftest.py:
#   grid_graph_files           — session-scoped, writes pkl files once
#   mock_grid_graph_file       — monkeypatches get_gerrydb_graph_file + flushes LRU cache
#   grid_shatterable_districtr_map
#   grid_nonshatterable_child_districtr_map
#   grid_nonshatterable_parent_districtr_map


def _block_lr():
    """64 block assignments: c < 4 → zone 1, c ≥ 4 → zone 2."""
    return [[_block_geoid(r, c), 1 if c < 4 else 2] for r in range(8) for c in range(8)]


def _block_4q():
    """64 block assignments: 4-quadrant zones (top-left=1, top-right=2, bottom-left=3, bottom-right=4)."""
    return [[_block_geoid(r, c), (r // 4) * 2 + (c // 4) + 1] for r in range(8) for c in range(8)]


def _vtd_lr():
    """16 VTD assignments: pc < 2 → zone 1, pc ≥ 2 → zone 2."""
    return [[_vtd_geoid(pr, pc), 1 if pc < 2 else 2] for pr in range(4) for pc in range(4)]


def _vtd_4q():
    """16 VTD assignments: 4-quadrant zones."""
    return [[_vtd_geoid(pr, pc), (pr // 2) * 2 + (pc // 2) + 1] for pr in range(4) for pc in range(4)]


def _mixed_shatterable():
    """Top half (r=0..3) as block GEOIDs + bottom half (pr=2..3) as VTD GEOIDs."""
    blocks = [[_block_geoid(r, c), 1 if c < 4 else 2] for r in range(4) for c in range(8)]
    parents = [[_vtd_geoid(pr, pc), 3 if pc < 2 else 4] for pr in range(2, 4) for pc in range(4)]
    return blocks + parents


def _put_assignments(client, document_id: str, assignments: list) -> None:
    resp = client.put("/api/assignments", json={
        "document_id": document_id,
        "assignments": assignments,
        "last_updated_at": datetime.now().astimezone().isoformat(),
    })
    assert resp.status_code == 200


# ── Document fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def grid_child_document(client, grid_nonshatterable_child_districtr_map):
    resp = client.post("/api/create_document", json={"districtr_map_slug": "grid_child"})
    assert resp.status_code == 201
    return resp.json()["document_id"]


@pytest.fixture
def grid_parent_document(client, grid_nonshatterable_parent_districtr_map):
    resp = client.post("/api/create_document", json={"districtr_map_slug": "grid_parent"})
    assert resp.status_code == 201
    return resp.json()["document_id"]


@pytest.fixture
def grid_shatterable_document(client, grid_shatterable_districtr_map):
    resp = client.post("/api/create_document", json={"districtr_map_slug": "grid_shatterable"})
    assert resp.status_code == 201
    return resp.json()["document_id"]


# ── Non-shatterable child (block-level) map ───────────────────────────────────


def test_cut_edges_nonshatterable_child_lr(
    client, session: Session, grid_child_document, mock_grid_graph_file
):
    """8×8 block map, left-right split → 8 cut edges at the c=3/c=4 column boundary."""
    _put_assignments(client, grid_child_document, _block_lr())
    ctx = _StubCompactnessContext(
        session, document_id=grid_child_document,
        child_layer=None, gerrydb_table=BLOCK_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "block"
    assert result["cut_count"] == 8


def test_cut_edges_nonshatterable_child_4q(
    client, session: Session, grid_child_document, mock_grid_graph_file
):
    """8×8 block map, 4-quadrant split → 16 cut edges (4 per boundary × 4 boundaries)."""
    _put_assignments(client, grid_child_document, _block_4q())
    ctx = _StubCompactnessContext(
        session, document_id=grid_child_document,
        child_layer=None, gerrydb_table=BLOCK_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "block"
    assert result["cut_count"] == 16


# ── Non-shatterable parent (VTD-level) map ────────────────────────────────────


def test_cut_edges_nonshatterable_vtd_parent_lr(
    client, session: Session, grid_parent_document, mock_grid_graph_file
):
    """4×4 VTD map, left-right split → 4 cut edges (one VTD edge per row, no weight)."""
    _put_assignments(client, grid_parent_document, _vtd_lr())
    ctx = _StubCompactnessContext(
        session, document_id=grid_parent_document,
        child_layer=None, gerrydb_table=PARENT_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "vtd"
    assert result["cut_count"] == 4


# ── Shatterable map — parent-only assignments (Step 1 only) ───────────────────


def test_cut_edges_shatterable_parent_only_lr(
    client, session: Session, grid_shatterable_document, mock_grid_graph_file
):
    """Shatterable, all parents assigned, left-right → 8 cuts (4 edges × weight 2)."""
    _put_assignments(client, grid_shatterable_document, _vtd_lr())
    ctx = _StubCompactnessContext(
        session, document_id=grid_shatterable_document,
        child_layer=BLOCK_GRID_NAME, gerrydb_table=BLOCK_GRID_NAME,
        parent_layer=PARENT_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "block"
    assert result["cut_count"] == 8


def test_cut_edges_shatterable_parent_only_4q(
    client, session: Session, grid_shatterable_document, mock_grid_graph_file
):
    """Shatterable, all parents assigned, 4-quadrant → 16 cuts (8 edges × weight 2)."""
    _put_assignments(client, grid_shatterable_document, _vtd_4q())
    ctx = _StubCompactnessContext(
        session, document_id=grid_shatterable_document,
        child_layer=BLOCK_GRID_NAME, gerrydb_table=BLOCK_GRID_NAME,
        parent_layer=PARENT_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "block"
    assert result["cut_count"] == 16


# ── Shatterable map — child-only assignments (Step 2 only) ────────────────────


def test_cut_edges_shatterable_child_only_lr(
    client, session: Session, grid_shatterable_document, mock_grid_graph_file
):
    """Shatterable, all blocks individually assigned, left-right → 8 cuts (same as non-shatterable child)."""
    _put_assignments(client, grid_shatterable_document, _block_lr())
    ctx = _StubCompactnessContext(
        session, document_id=grid_shatterable_document,
        child_layer=BLOCK_GRID_NAME, gerrydb_table=BLOCK_GRID_NAME,
        parent_layer=PARENT_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "block"
    assert result["cut_count"] == 8


# ── Shatterable map — mixed assignments (Step 1 + Step 2) ────────────────────


def test_cut_edges_shatterable_mixed_grid(
    client, session: Session, grid_shatterable_document, mock_grid_graph_file
):
    """Shatterable, top half shattered at block level, bottom half at parent level → 16 cuts.

    Step 1: 2 bottom parent boundary edges (pc=1/2) × weight 2 = 4
    Step 2: 4 half-counted block edges at c=3/4 in top half = 4
            8 direct cuts where block row 3 meets parent row 2 (all cross-zone) = 8
    """
    _put_assignments(client, grid_shatterable_document, _mixed_shatterable())
    ctx = _StubCompactnessContext(
        session, document_id=grid_shatterable_document,
        child_layer=BLOCK_GRID_NAME, gerrydb_table=BLOCK_GRID_NAME,
        parent_layer=PARENT_GRID_NAME,
    )
    result = block_cut_edges(ctx)
    assert result["unit_type"] == "block"
    assert result["cut_count"] == 16
