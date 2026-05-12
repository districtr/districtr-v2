"""Tests for county splits metrics (app.evaluation.splits).

Unit-test data is a simplified 3×3 grid of 9 blocks arranged into 3 counties and
3 districts:

    County layout:
        20001: blocks 0,1,2,3
        20003: blocks 4,5
        20005: blocks 6,7,8

    District layout (zone):
        zone 1: blocks 0,1,4
        zone 2: blocks 2,3,5
        zone 3: blocks 6,7,8

    County populations:
        20001: 4000   forced = ceil(4000/1000) = 4
        20003: 1500   forced = ceil(1500/1000) = 2
        20005:  900   forced = ceil(900/1000)  = 1
        20007:  500   (fully unassigned — no blocks in query results)
                       forced = ceil(500/1000) = 1

    Actual splits:
        20001: zones {1,2}  → actual = 2
        20003: zones {1,2}  → actual = 2
        20005: zones {3}    → actual = 1
        20007: (none)       → actual = 0

    ideal_population = 1000

Integration-test data uses the ks_ellis_county_vtd + ks_ellis_county_block gerrydb
fixtures (Ellis County, KS — all VTDs/blocks have county FIPS 20051).  Six VTDs are
assigned to three distinct zones; the test verifies that county_pieces() queries the
real parentchildedges table and returns the correct actual split count.
"""

from datetime import datetime

import pytest
from sqlmodel import Session
from unittest.mock import MagicMock

from app.evaluation.context import (
    COUNTY_CONTEXT,
    CountyContext,
    CountyGeoid,
    DocumentEvaluationContext,
    GerrydbTableName,
)
from app.evaluation.splits import county_pieces
from app.models import DistrictUnionsResponse
from app.utils import create_parent_child_edges


# ── Shared stub ──────────────────────────────────────────────────────────────

_GERRYDB_TABLE = GerrydbTableName("test_splits_table")
_IDEAL_POP = 1000


class _StubSplitsContext(DocumentEvaluationContext):
    """Minimal stub that injects gerrydb_table, ideal_population, and session directly.

    Pass document_id="stub" (default) for unit tests with a mocked session, or a real
    UUID string for integration tests backed by the test database.
    """

    def __init__(
        self,
        session,
        gerrydb_table=_GERRYDB_TABLE,
        ideal_population=_IDEAL_POP,
        document_id="stub",
    ):
        super().__init__(background_tasks=None, session=session, document_id=document_id)  # type: ignore[arg-type]
        self.__dict__["district_stats"] = []
        self.__dict__["gerrydb_table"] = gerrydb_table
        self.__dict__["ideal_population"] = ideal_population


# ── Unit tests (mocked DB) ───────────────────────────────────────────────────

_COUNTY_POPS: dict[CountyGeoid, int] = {
    CountyGeoid("20001"): 4000,
    CountyGeoid("20003"): 1500,
    CountyGeoid("20005"): 900,
    CountyGeoid("20007"): 500,
}

_QUERY_ROWS = [
    {"county_geoid": "20001", "zones": [1, 2]},
    {"county_geoid": "20003", "zones": [1, 2]},
    {"county_geoid": "20005", "zones": [3]},
    # 20007 absent — no assigned blocks
]


@pytest.fixture
def splits_context():
    COUNTY_CONTEXT._pop_cache[_GERRYDB_TABLE] = _COUNTY_POPS

    mock_session = MagicMock()
    mock_session.execute.return_value.mappings.return_value.all.return_value = _QUERY_ROWS

    yield _StubSplitsContext(mock_session)

    COUNTY_CONTEXT._pop_cache.pop(_GERRYDB_TABLE, None)
    COUNTY_CONTEXT._attempts.pop(_GERRYDB_TABLE, None)


def test_county_pieces_actual_splits(splits_context):
    result = county_pieces(splits_context)
    assert result["20001"][1] == 2  # zones 1 and 2
    assert result["20003"][1] == 2  # zones 1 and 2
    assert result["20005"][1] == 1  # zone 3 only
    assert result["20007"][1] == 0  # no assigned blocks


def test_county_pieces_forced_splits(splits_context):
    result = county_pieces(splits_context)
    assert result["20001"][0] == 4  # ceil(4000/1000)
    assert result["20003"][0] == 2  # ceil(1500/1000)
    assert result["20005"][0] == 1  # ceil(900/1000)
    assert result["20007"][0] == 1  # ceil(500/1000)


def test_county_pieces_keyed_by_county_pops(splits_context):
    """Result contains exactly the counties in county_pops, including unassigned ones."""
    result = county_pieces(splits_context)
    assert set(result.keys()) == {"20001", "20003", "20005", "20007"}


def test_county_pieces_empty_when_no_county_pops():
    """Returns {} when county_pops is empty (e.g. block-level table with no prefixed paths)."""
    COUNTY_CONTEXT._pop_cache[_GERRYDB_TABLE] = {}
    try:
        mock_session = MagicMock()
        mock_session.execute.return_value.mappings.return_value.all.return_value = _QUERY_ROWS
        ctx = _StubSplitsContext(mock_session)
        assert county_pieces(ctx) == {}
    finally:
        COUNTY_CONTEXT._pop_cache.pop(_GERRYDB_TABLE, None)
        COUNTY_CONTEXT._attempts.pop(_GERRYDB_TABLE, None)


def test_county_pieces_fully_assigned_county_not_split(splits_context):
    """A county wholly within one district has actual_split_pieces == 1."""
    result = county_pieces(splits_context)
    assert result["20005"][1] == 1


def test_county_pieces_forced_never_zero(splits_context):
    """Every county in county_pops with nonzero population has forced >= 1."""
    result = county_pieces(splits_context)
    for geoid, (forced, _actual) in result.items():
        assert forced >= 1, f"{geoid}: forced should be >= 1"


def test_county_pieces_empty_when_attempts_exhausted():
    """Returns {} when county_populations has exhausted all load attempts."""
    COUNTY_CONTEXT._pop_cache.pop(_GERRYDB_TABLE, None)
    COUNTY_CONTEXT._attempts[_GERRYDB_TABLE] = CountyContext.MAX_LOAD_ATTEMPTS
    try:
        mock_session = MagicMock()
        mock_session.execute.return_value.mappings.return_value.all.return_value = _QUERY_ROWS
        ctx = _StubSplitsContext(mock_session)
        assert county_pieces(ctx) == {}
    finally:
        COUNTY_CONTEXT._attempts.pop(_GERRYDB_TABLE, None)


# ── Integration tests (real DB) ──────────────────────────────────────────────
#
# All 43 VTDs in the ks_ellis_county_vtd fixture belong to Ellis County, KS
# (FIPS 20051).  Six VTDs are assigned to three distinct zones, so the
# parentchildedges spatial join should produce blocks in all three zones —
# confirming actual_split_pieces == 3 for county 20051.

_KS_ELLIS_TABLE = GerrydbTableName("ks_ellis_geos")
_KS_ELLIS_COUNTY = CountyGeoid("20051")
_KS_ELLIS_TOTAL_POP = 30000
_KS_ELLIS_IDEAL_POP = 10000


@pytest.fixture
def ks_ellis_splits_context(
    client,
    session: Session,
    ks_ellis_shatterable_districtr_map,
    gerrydb_ks_ellis_geos_view,
):
    """Real-DB context: 6 VTDs from Ellis County assigned to 3 zones.

    Builds parentchildedges, creates a document, inserts VTD assignments via the
    API, then yields a _StubSplitsContext backed by the live test session.
    County populations are pre-populated in COUNTY_CONTEXT to avoid triggering
    the evaluation.county_demographics loading path (tested separately).
    """
    create_parent_child_edges(
        session=session, districtr_map_uuid=ks_ellis_shatterable_districtr_map
    )

    resp = client.post(
        "/api/create_document",
        json={"districtr_map_slug": "ks_ellis_geos"},
    )
    assert resp.status_code == 201
    document_id = resp.json()["document_id"]

    resp = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["vtd:20051120060", 1],
                ["vtd:20051000280", 1],
                ["vtd:20051900090", 2],
                ["vtd:20051900010", 2],
                ["vtd:20051900100", 3],
                ["vtd:20051900070", 3],
            ],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert resp.status_code == 200

    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE] = {_KS_ELLIS_COUNTY: _KS_ELLIS_TOTAL_POP}

    yield _StubSplitsContext(
        session,
        gerrydb_table=_KS_ELLIS_TABLE,
        ideal_population=_KS_ELLIS_IDEAL_POP,
        document_id=document_id,
    )

    COUNTY_CONTEXT._pop_cache.pop(_KS_ELLIS_TABLE, None)
    COUNTY_CONTEXT._attempts.pop(_KS_ELLIS_TABLE, None)


def test_county_pieces_db_actual_three_zones(ks_ellis_splits_context):
    """Integration: all assigned VTDs are in Ellis County; 3 distinct zones → actual == 3."""
    result = county_pieces(ks_ellis_splits_context)
    assert result[_KS_ELLIS_COUNTY][1] == 3


def test_county_pieces_db_forced_from_population(ks_ellis_splits_context):
    """Integration: forced = ceil(30000 / 10000) = 3."""
    result = county_pieces(ks_ellis_splits_context)
    assert result[_KS_ELLIS_COUNTY][0] == 3


def test_county_pieces_db_unassigned_county_zero(ks_ellis_splits_context):
    """Integration: a county absent from block assignments has actual == 0."""
    phantom = CountyGeoid("99999")
    COUNTY_CONTEXT._pop_cache[_KS_ELLIS_TABLE][phantom] = 5000
    result = county_pieces(ks_ellis_splits_context)
    assert result[phantom][1] == 0
    assert result[phantom][0] == 1  # ceil(5000 / 10000)
