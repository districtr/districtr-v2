"""Tests for county splits metrics (app.evaluation.splits).

All tests use the ks_ellis_county_vtd + ks_ellis_county_block gerrydb fixtures
(Ellis County, KS — all VTDs/blocks have county FIPS 20051) with a real DB session.

Assignment scenarios:
    Three-zone: 6 VTDs, 2 per zone (1/2/3) → actual_split_pieces = 3
    Single-zone: same 6 VTDs, all zone 1  → actual_split_pieces = 1

County population: 30000 (pre-seeded in COUNTY_CONTEXT cache).
"""

from datetime import datetime

import pytest
from sqlmodel import Session

from app.evaluation.context import (
    COUNTY_CONTEXT,
    CountyContext,
    CountyGeoid,
    DocumentEvaluationContext,
    GerrydbTableName,
)
from app.evaluation.splits import county_pieces


_KS_ELLIS_TABLE = GerrydbTableName("ks_ellis_county_vtd")
_KS_ELLIS_COUNTY = CountyGeoid("20051")
_KS_ELLIS_TOTAL_POP = 30000
_KS_ELLIS_IDEAL_POP = 10000
# Rooks County, KS — real FIPS used as a phantom unassigned county in tests.
_KS_PHANTOM_COUNTY = CountyGeoid("20163")

_COUNTY_NAMES: dict[CountyGeoid, str] = {
    _KS_ELLIS_COUNTY: "Ellis County",
    _KS_PHANTOM_COUNTY: "Rooks County",
}

_THREE_ZONE_ASSIGNMENTS = [
    ["vtd:20051120060", 1],
    ["vtd:20051000280", 1],
    ["vtd:20051900090", 2],
    ["vtd:20051900010", 2],
    ["vtd:20051900100", 3],
    ["vtd:20051900070", 3],
]

_SINGLE_ZONE_ASSIGNMENTS = [
    ["vtd:20051120060", 1],
    ["vtd:20051000280", 1],
    ["vtd:20051900090", 1],
    ["vtd:20051900010", 1],
    ["vtd:20051900100", 1],
    ["vtd:20051900070", 1],
]


class _StubSplitsContext(DocumentEvaluationContext):
    """Real-session context that injects gerrydb_table and ideal_population directly,
    bypassing the DB lookups for those cached properties."""

    def __init__(self, session, document_id, parent_layer=_KS_ELLIS_TABLE, ideal_population=_KS_ELLIS_IDEAL_POP):
        super().__init__(background_tasks=None, session=session, document_id=document_id)  # type: ignore[arg-type]
        self.__dict__["district_stats"] = []
        self.__dict__["parent_layer"] = parent_layer
        self.__dict__["ideal_population"] = ideal_population


def _put_assignments(client, document_id, assignments):
    resp = client.put("/api/assignments", json={
        "document_id": document_id,
        "assignments": assignments,
        "last_updated_at": datetime.now().astimezone().isoformat(),
    })
    assert resp.status_code == 200


def _create_context(client, session, assignments, ideal_population=_KS_ELLIS_IDEAL_POP):
    """Create a document, insert assignments, pre-seed county pops, return a context."""
    resp = client.post("/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"})
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    _put_assignments(client, document_id, assignments)
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {_KS_ELLIS_COUNTY: _KS_ELLIS_TOTAL_POP}
    COUNTY_CONTEXT._name_cache.update(_COUNTY_NAMES)
    return _StubSplitsContext(session, document_id=document_id, ideal_population=ideal_population)


def _cleanup_county_context():
    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._name_cache.clear()


@pytest.fixture
def three_zone_context(client, session: Session, ks_ellis_shatterable_districtr_map, gerrydb_ks_ellis_geos_view):
    yield _create_context(client, session, _THREE_ZONE_ASSIGNMENTS)
    _cleanup_county_context()


@pytest.fixture
def single_zone_context(client, session: Session, ks_ellis_shatterable_districtr_map, gerrydb_ks_ellis_geos_view):
    yield _create_context(client, session, _SINGLE_ZONE_ASSIGNMENTS)
    _cleanup_county_context()


# ── Actual split pieces ───────────────────────────────────────────────────────


def test_county_pieces_actual_three_zones(three_zone_context):
    """2 VTDs each in 3 zones → actual = 3 for Ellis County."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY][1] == 3


def test_county_pieces_actual_single_zone(single_zone_context):
    """All assigned VTDs in one zone → actual = 1."""
    result = county_pieces(single_zone_context)
    assert result[_KS_ELLIS_COUNTY][1] == 1


def test_county_pieces_name(three_zone_context):
    """Third element of the tuple is the Census county name."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY][2] == "Ellis County"


def test_county_pieces_unassigned_county_zero(three_zone_context):
    """A county absent from assignments has actual = 0."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert result[phantom][1] == 0


# ── Population ───────────────────────────────────────────────────────────────


def test_county_pieces_population(three_zone_context):
    """First tuple element is the county population."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY][0] == _KS_ELLIS_TOTAL_POP


# ── Retesting for old bug: cold cache + shatterable map ──────────────────────────────
def test_county_pieces_cold_cache_shatterable_map(
    client, session: Session, ks_ellis_shatterable_districtr_map, gerrydb_ks_ellis_geos_view
):
    """county_pieces must work on a cold cache when the map is shatterable.

    The old bug: county_pieces passes context.gerrydb_table (the combined
    materialized view, relkind='m') to county_populations, which trips the
    relkind != 'r' guard in _populate_county_data.
    """
    _KS_ELLIS_PARENT_LAYER = GerrydbTableName("ks_ellis_county_vtd")
    _cleanup_county_context()
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_PARENT_LAYER] = {_KS_ELLIS_COUNTY: _KS_ELLIS_TOTAL_POP}
    COUNTY_CONTEXT._name_cache.update(_COUNTY_NAMES)
    try:
        resp = client.post("/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"})
        assert resp.status_code == 201
        document_id = resp.json()["document_id"]
        _put_assignments(client, document_id, _THREE_ZONE_ASSIGNMENTS)

        ctx = _StubSplitsContext(session, document_id=document_id)

        result = county_pieces(ctx)
        assert result[_KS_ELLIS_COUNTY][1] == 3
    finally:
        COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_PARENT_LAYER, None)
        COUNTY_CONTEXT._attempts.pop(_KS_ELLIS_PARENT_LAYER, None)


def test_county_pieces_unassigned_county_population(three_zone_context):
    """A county absent from assignments still reports its population."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert result[phantom][0] == 5000


def test_county_pieces_keyed_by_county_pops(three_zone_context):
    """Result contains exactly the counties present in county_pops."""
    phantom = _KS_PHANTOM_COUNTY
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert set(result.keys()) == {_KS_ELLIS_COUNTY, phantom}


# ── COUNTY_CONTEXT guard behavior ────────────────────────────────────────────


def test_county_pieces_empty_when_no_county_pops(
    client, session: Session, ks_ellis_shatterable_districtr_map, gerrydb_ks_ellis_geos_view
):
    """Returns {} immediately when county_pops is empty."""
    resp = client.post("/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"})
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    _put_assignments(client, document_id, _THREE_ZONE_ASSIGNMENTS)
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {}
    try:
        ctx = _StubSplitsContext(session, document_id=document_id)
        assert county_pieces(ctx) == {}
    finally:
        _cleanup_county_context()


def test_county_pieces_raises_when_attempts_exhausted(
    client, session: Session, ks_ellis_shatterable_districtr_map, gerrydb_ks_ellis_geos_view
):
    """Raises ValueError when county_populations has exhausted all load attempts."""
    resp = client.post("/api/create_document", json={"districtr_map_slug": "ks_ellis_geos"})
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]
    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts[_KS_ELLIS_TABLE] = CountyContext.MAX_LOAD_ATTEMPTS
    try:
        ctx = _StubSplitsContext(session, document_id=document_id)
        with pytest.raises(ValueError):
            county_pieces(ctx)
    finally:
        _cleanup_county_context()
