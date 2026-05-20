"""Tests for county splits metrics (app.evaluation.splits).

All tests use the ks_ellis_county_vtd + ks_ellis_county_block gerrydb fixtures
(Ellis County, KS — all VTDs/blocks have county FIPS 20051) with a real DB session.

Assignment scenarios:
    Three-zone: 6 VTDs, 2 per zone (1/2/3) → actual_split_pieces = 3
    Single-zone: same 6 VTDs, all zone 1  → actual_split_pieces = 1

County population: 30000, ideal_population: 10000 → forced = ceil(30000/10000) = 3
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


_KS_ELLIS_TABLE = GerrydbTableName("ks_ellis_geos")
_KS_ELLIS_COUNTY = CountyGeoid("20051")
_KS_ELLIS_TOTAL_POP = 30000
_KS_ELLIS_IDEAL_POP = 10000

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

    def __init__(self, session, document_id, gerrydb_table=_KS_ELLIS_TABLE, ideal_population=_KS_ELLIS_IDEAL_POP):
        super().__init__(background_tasks=None, session=session, document_id=document_id)  # type: ignore[arg-type]
        self.__dict__["district_stats"] = []
        self.__dict__["gerrydb_table"] = gerrydb_table
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
    return _StubSplitsContext(session, document_id=document_id, ideal_population=ideal_population)


def _cleanup_county_context():
    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts.pop(_KS_ELLIS_TABLE, None)


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


def test_county_pieces_unassigned_county_zero(three_zone_context):
    """A county absent from assignments has actual = 0."""
    phantom = CountyGeoid("99999")
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert result[phantom][1] == 0


# ── Forced split pieces ───────────────────────────────────────────────────────


def test_county_pieces_forced_from_population(three_zone_context):
    """forced = ceil(30000 / 10000) = 3."""
    result = county_pieces(three_zone_context)
    assert result[_KS_ELLIS_COUNTY][0] == 3


def test_county_pieces_forced_never_zero(three_zone_context):
    """Every county with nonzero population has forced >= 1."""
    result = county_pieces(three_zone_context)
    for geoid, (forced, _actual) in result.items():
        assert forced >= 1, f"{geoid}: forced should be >= 1"


def test_county_pieces_unassigned_county_forced(three_zone_context):
    """A county absent from assignments still gets a forced count from its population."""
    phantom = CountyGeoid("99999")
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(three_zone_context)
    assert result[phantom][0] == 1  # ceil(5000 / 10000)


def test_county_pieces_keyed_by_county_pops(three_zone_context):
    """Result contains exactly the counties present in county_pops."""
    phantom = CountyGeoid("99999")
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
